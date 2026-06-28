import { describe, it, expect } from "vitest";
import { isLockedOutFromHistory, type AttemptRow } from "./login-attempts";

// N-10: the login lockout must not become a self-inflicted DoS. An attacker
// flooding wrong passwords must NOT be able to lock the real operator out.
// These tests exercise the pure lockout policy and a faithful model of the
// auth.ts authorize() flow (verify-credentials-first + no-record-while-locked).

const MAX = 10;
const WINDOW_MIN = 15;
const now = new Date("2026-06-21T12:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("isLockedOutFromHistory (N-10 lockout policy)", () => {
  it("locks once failures hit the threshold inside the window", () => {
    const flood: AttemptRow[] = Array.from({ length: MAX }, () => ({
      success: false,
      createdAt: minsAgo(1),
    }));
    expect(isLockedOutFromHistory(flood, now, MAX, WINDOW_MIN)).toBe(true);
  });

  it("does not lock below the threshold", () => {
    const few: AttemptRow[] = Array.from({ length: MAX - 1 }, () => ({
      success: false,
      createdAt: minsAgo(1),
    }));
    expect(isLockedOutFromHistory(few, now, MAX, WINDOW_MIN)).toBe(false);
  });

  it("a successful login forgives the window — prior failures stop counting", () => {
    const history: AttemptRow[] = [
      ...Array.from({ length: MAX + 5 }, () => ({
        success: false,
        createdAt: minsAgo(5),
      })),
      // operator gets in AFTER the flood
      { success: true, createdAt: minsAgo(2) },
    ];
    expect(isLockedOutFromHistory(history, now, MAX, WINDOW_MIN)).toBe(false);
  });

  it("the window expires — stale failures age out", () => {
    const stale: AttemptRow[] = Array.from({ length: MAX + 5 }, () => ({
      success: false,
      createdAt: minsAgo(WINDOW_MIN + 5), // older than the window
    }));
    expect(isLockedOutFromHistory(stale, now, MAX, WINDOW_MIN)).toBe(false);
  });

  it("only failures AFTER the last success count, even within the window", () => {
    const history: AttemptRow[] = [
      { success: true, createdAt: minsAgo(10) },
      // 3 fresh failures after the success — below MAX, must not lock
      ...Array.from({ length: 3 }, () => ({
        success: false,
        createdAt: minsAgo(1),
      })),
      // a huge pre-success flood that must be forgiven
      ...Array.from({ length: MAX * 3 }, () => ({
        success: false,
        createdAt: minsAgo(11),
      })),
    ];
    expect(isLockedOutFromHistory(history, now, MAX, WINDOW_MIN)).toBe(false);
  });
});

// --- Faithful model of auth.ts authorize() under N-10 ---------------------
// Mirrors the verify-first / record-on-success / skip-record-while-locked
// flow so we can prove the operator logs in despite an ongoing flood without
// standing up NextAuth or a live DB.

function makeAuthorize(correctPassword: string, history: AttemptRow[]) {
  return function authorize(
    password: string,
    at: Date,
  ): { id: string } | null {
    const ok = password === correctPassword;
    if (ok) {
      history.push({ success: true, createdAt: at }); // forgives window
      return { id: "admin" };
    }
    // wrong password: do not self-amplify while already locked
    if (isLockedOutFromHistory(history, at, MAX, WINDOW_MIN)) {
      return null;
    }
    history.push({ success: false, createdAt: at });
    return null;
  };
}

describe("authorize() flow under attacker flood (N-10 must-fix)", () => {
  it("the correct password logs in despite an ongoing wrong-password flood", () => {
    const history: AttemptRow[] = [];
    const authorize = makeAuthorize("hunter2", history);
    let t = now.getTime();
    const next = () => new Date((t += 1000));

    // Attacker floods 100 wrong passwords.
    for (let i = 0; i < 100; i++) {
      expect(authorize("wrong", next())).toBeNull();
    }

    // The lockout has tripped for further WRONG attempts...
    expect(authorize("still-wrong", next())).toBeNull();

    // ...but the real operator's CORRECT password still gets in.
    const result = authorize("hunter2", next());
    expect(result).not.toBeNull();
    expect(result?.id).toBe("admin");

    // And after that success, even wrong attempts are no longer locked
    // (window forgiven) until a fresh flood rebuilds the threshold.
    expect(isLockedOutFromHistory(history, next(), MAX, WINDOW_MIN)).toBe(
      false,
    );
  });

  it("a wrong-password flood does not self-amplify: recorded failures cap at the threshold", () => {
    const history: AttemptRow[] = [];
    const authorize = makeAuthorize("hunter2", history);
    let t = now.getTime();
    const next = () => new Date((t += 1000));

    for (let i = 0; i < 500; i++) authorize("wrong", next());

    const recordedFailures = history.filter((a) => !a.success).length;
    // Once locked, further failures are NOT recorded, so the stored count
    // stops growing instead of extending the lockout indefinitely.
    expect(recordedFailures).toBe(MAX);
  });
});
