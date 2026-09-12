import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  IntegrationFailure,
  sanitizeErrorMessage,
} from "@/lib/integrations/shared/failures";
import {
  applyObservation,
  initialRateLimitState,
  observeHeaders,
  pauseSeconds,
} from "@/lib/integrations/shared/rate-limit";
import { detectDrift, summarizeDrift } from "@/lib/integrations/shared/drift";
import { deriveIntegrationAlerts, maskEmail } from "@/lib/integrations/alerts";
import { resolveWindow } from "@/lib/integrations/sync/engine";
import { currentOccurrence } from "@/lib/integrations/jobs/runner";
import { occurrenceKey } from "@/lib/integrations/reports/execute";
import {
  resolveDeliveryProvider,
  safeSubject,
  TestDeliveryProvider,
} from "@/lib/integrations/delivery/email";

describe("failure classification", () => {
  it("carries explicit IntegrationFailure codes with correct retryability", () => {
    expect(classifyFailure(new IntegrationFailure("rate_limited", "429"))).toMatchObject({
      code: "rate_limited",
      retryable: true,
    });
    expect(classifyFailure(new IntegrationFailure("schema_drift", "x"))).toMatchObject({
      code: "schema_drift",
      retryable: false,
    });
    expect(classifyFailure(new IntegrationFailure("authentication_failed", "x")).retryable).toBe(false);
    expect(classifyFailure(new IntegrationFailure("network_timeout", "x")).retryable).toBe(true);
    expect(classifyFailure(new IntegrationFailure("delivery_not_configured", "x")).retryable).toBe(false);
  });

  it("classifies generic errors heuristically", () => {
    expect(classifyFailure(new Error("connect ETIMEDOUT 1.2.3.4")).code).toBe("network_timeout");
    expect(classifyFailure(new Error("HTTP 429 rate limit exceeded")).code).toBe("rate_limited");
    expect(classifyFailure(new Error("401 invalid token")).code).toBe("authentication_failed");
    expect(classifyFailure(new Error("403 Forbidden")).code).toBe("authorization_failed");
    expect(classifyFailure(new Error("502 Bad Gateway")).code).toBe("provider_unavailable");
    expect(classifyFailure(new Error("mystery")).code).toBe("unknown");
    expect(classifyFailure(new Error("mystery")).retryable).toBe(true);
  });

  it("sanitizes credential-shaped substrings and bounds length", () => {
    const message = sanitizeErrorMessage(
      "failed with Authorization: Bearer abc.def-ghi and refreshToken=SECRET123 plus api_key: sk-999",
    );
    expect(message).not.toContain("abc.def-ghi");
    expect(message).not.toContain("SECRET123");
    expect(message).not.toContain("sk-999");
    expect(sanitizeErrorMessage("x".repeat(1000)).length).toBe(300);
  });
});

describe("rate-limit handling", () => {
  it("tracks throttle streaks and clears on success", () => {
    let state = initialRateLimitState();
    state = applyObservation(state, {
      remaining: 0,
      resetAt: null,
      retryAfterSeconds: 7,
      throttled: true,
    });
    expect(state.consecutiveThrottles).toBe(1);
    expect(pauseSeconds(state)).toBe(7);
    state = applyObservation(state, {
      remaining: 0,
      resetAt: null,
      retryAfterSeconds: 4000,
      throttled: true,
    });
    expect(state.consecutiveThrottles).toBe(2);
    expect(pauseSeconds(state)).toBe(3600); // Retry-After honored but capped
    state = applyObservation(state, {
      remaining: 50,
      resetAt: null,
      retryAfterSeconds: null,
      throttled: false,
    });
    expect(state.consecutiveThrottles).toBe(0);
    expect(pauseSeconds(state)).toBe(0);
    expect(state.requestsMade).toBe(3);
  });

  it("never busy-loops: throttled state always pauses ≥ 1 s", () => {
    let state = initialRateLimitState();
    state = applyObservation(state, {
      remaining: null,
      resetAt: null,
      retryAfterSeconds: 0,
      throttled: true,
    });
    expect(pauseSeconds(state)).toBeGreaterThanOrEqual(1);
  });

  it("parses standard headers", () => {
    const headers = new Map([
      ["retry-after", "12"],
      ["x-ratelimit-remaining", "3"],
    ]);
    const observation = observeHeaders({ get: (n) => headers.get(n) ?? null });
    expect(observation.retryAfterSeconds).toBe(12);
    expect(observation.remaining).toBe(3);
    expect(observation.throttled).toBe(true);
  });
});

describe("schema drift", () => {
  const expectations = [
    { name: "id", required: true, type: "string" as const },
    { name: "status", required: true, type: "string" as const },
    { name: "price", required: false, type: "number" as const },
  ];

  it("flags missing required fields and type changes; lists new fields", () => {
    const report = detectDrift({ id: "a", price: "12", extra_field: 1 }, expectations);
    expect(report.hasDrift).toBe(true);
    expect(report.missingRequired).toEqual(["status"]);
    expect(report.typeChanges).toEqual([{ field: "price", expected: "number", actual: "string" }]);
    expect(report.newFields).toEqual(["extra_field"]);
  });

  it("new fields alone are not drift (nothing is discarded)", () => {
    const report = detectDrift({ id: "a", status: "ok", brand_new: true }, expectations);
    expect(report.hasDrift).toBe(false);
    expect(report.newFields).toEqual(["brand_new"]);
  });

  it("summarizes across records", () => {
    const summary = summarizeDrift([
      detectDrift({ id: "a" }, expectations),
      detectDrift({ id: "b", status: 5 }, expectations),
    ]);
    expect(summary.hasDrift).toBe(true);
    expect(summary.missingRequired).toContain("status");
    expect(summary.typeChanges.map((c) => c.field)).toContain("status");
  });
});

describe("integration alerts", () => {
  it("derives one alert per condition with deep links, criticals first", () => {
    const alerts = deriveIntegrationAlerts({
      connections: [
        { id: "c1", name: "A", status: "failed", lastHealthStatus: null },
        { id: "c2", name: "B", status: "degraded", lastHealthStatus: "schema_drift" },
        { id: "c3", name: "C", status: "revoked", lastHealthStatus: null },
        { id: "c4", name: "D", status: "active", lastHealthStatus: "ok" },
      ],
      recentRuns: [
        { id: "r1", status: "failed", failureCode: "rate_limited", connectionName: "A" },
        { id: "r2", status: "failed", failureCode: "schema_drift", connectionName: "B" },
        { id: "r3", status: "succeeded", failureCode: null, connectionName: "D" },
      ],
      jobs: [
        { id: "j1", status: "dead_lettered", jobType: "appointment_sync", attemptCount: 5 },
        { id: "j2", status: "retryable_failed", jobType: "appointment_sync", attemptCount: 3 },
        { id: "j3", status: "succeeded", jobType: "cleanup", attemptCount: 1 },
      ],
      deliveries: [
        { id: "d1", status: "failed", recipientMasked: "a***@x.test" },
        { id: "d2", status: "accepted", recipientMasked: "b***@x.test" },
      ],
      batchesAwaitingReview: [{ id: "b1", filename: "sync.csv" }],
    });
    const codes = alerts.map((a) => a.code);
    expect(codes).toContain("connection_validation_failed");
    expect(codes).toContain("schema_drift_detected");
    expect(codes).toContain("credentials_revoked");
    expect(codes).toContain("provider_rate_limited");
    expect(codes).toContain("sync_failed");
    expect(codes).toContain("dead_letter_job_created");
    expect(codes).toContain("repeated_retry_threshold");
    expect(codes).toContain("report_delivery_failed");
    expect(codes).toContain("import_batch_requires_review");
    expect(alerts[0]!.severity).toBe("critical");
    expect(alerts.at(-1)!.severity).toBe("info");
    for (const alert of alerts) expect(alert.link.startsWith("/")).toBe(true);
  });

  it("masks emails for broad display", () => {
    expect(maskEmail("kevin@example.com")).toBe("k***@example.com");
    expect(maskEmail("bad-input")).toBe("***");
  });
});

describe("windows and occurrences", () => {
  it("resolves fixed and trailing windows", () => {
    expect(
      resolveWindow(
        {
          window_strategy: "fixed_range",
          window_days: 30,
          window_start: "2099-07-01",
          window_end: "2099-07-31",
        },
        "2026-08-01",
      ),
    ).toEqual({ startDate: "2099-07-01", endDate: "2099-07-31" });
    const trailing = resolveWindow(
      { window_strategy: "trailing_days", window_days: 7, window_start: null, window_end: null },
      "2026-08-01",
    );
    expect(trailing).toEqual({ startDate: "2026-07-25", endDate: "2026-08-01" });
  });

  it("normalizes occurrences per frequency (idempotent scheduler ticks)", () => {
    const now = new Date("2026-08-12T15:42:31Z"); // a Wednesday
    expect(currentOccurrence("daily", now)).toBe("2026-08-12T00:00:00.000Z");
    expect(currentOccurrence("weekly", now)).toBe("2026-08-09T00:00:00.000Z");
    expect(currentOccurrence("monthly", now)).toBe("2026-08-01T00:00:00.000Z");
    expect(currentOccurrence("period_close", now)).toBeNull();
    expect(currentOccurrence("custom", now)).toBeNull();
    // Two ticks in the same window resolve to the SAME occurrence.
    expect(currentOccurrence("daily", new Date("2026-08-12T23:59:59Z"))).toBe(
      currentOccurrence("daily", now),
    );
  });

  it("occurrenceKey strips seconds", () => {
    expect(occurrenceKey(new Date("2026-08-12T15:42:31.500Z"))).toBe("2026-08-12T15:42:00.000Z");
  });
});

describe("email delivery abstraction", () => {
  it("fails closed when no channel or provider is configured", () => {
    expect(() => resolveDeliveryProvider(null)).toThrow(/no email delivery provider/i);
    expect(() =>
      resolveDeliveryProvider({ provider: "none_configured", status: "unconfigured" }),
    ).toThrow(IntegrationFailure);
    expect(() => resolveDeliveryProvider({ provider: "test", status: "disabled" })).toThrow(
      /disabled/i,
    );
    // Declared-but-unconfigured real providers are never simulated.
    expect(() => resolveDeliveryProvider({ provider: "resend", status: "active" })).toThrow(
      /not implemented/i,
    );
  });

  it("test provider accepts valid recipients and reports honest outcomes", async () => {
    const provider = new TestDeliveryProvider();
    const ok = await provider.send({
      to: "user@example.com",
      subject: "s",
      bodyText: "b",
      linkPath: "/performance-operations/reports",
      attachment: null,
    });
    expect(ok.accepted).toBe(true);
    expect(ok.state).toBe("accepted"); // never claims 'delivered'
    expect(ok.providerMessageId).toBeTruthy();

    const rejected = await provider.send({
      to: "user@reject.test",
      subject: "s",
      bodyText: "b",
      linkPath: null,
      attachment: null,
    });
    expect(rejected).toMatchObject({ accepted: false, state: "rejected", retryable: false });

    const deferred = await provider.send({
      to: "user@defer.test",
      subject: "s",
      bodyText: "b",
      linkPath: null,
      attachment: null,
    });
    expect(deferred).toMatchObject({ accepted: false, state: "failed", retryable: true });

    const invalid = await provider.send({
      to: "not-an-email",
      subject: "s",
      bodyText: "b",
      linkPath: null,
      attachment: null,
    });
    expect(invalid.state).toBe("rejected");
  });

  it("bounds subject length", () => {
    expect(safeSubject("x".repeat(200), "June").length).toBeLessThanOrEqual(150);
  });
});
