import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";

vi.mock("~/db", () => import("~/test/test-db"));

import { db } from "~/db";
import { resetTestDb } from "~/test/test-db";
import { UserRole, users } from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { loader } from "./layout.app";

// ─── Fixtures ───

function createUser(name: string, role: UserRole) {
  return db
    .insert(users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

async function requestAs(userId: number) {
  const headers = new Headers({ "CF-IPCountry": "US" });
  const setCookie = await setCurrentUserId(
    new Request("http://localhost/"),
    userId
  );
  headers.set("Cookie", setCookie.split(";")[0] ?? "");
  return new Request("http://localhost/dashboard", { headers });
}

type LoaderArgs = Parameters<typeof loader>[0];

function loaderArgs(request: Request) {
  return {
    request,
    url: new URL(request.url),
    params: {},
    context: {},
  } as unknown as LoaderArgs;
}

function rsaKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function base64UrlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Checks the token's RS256 signature and returns its header and claims. */
function readVerifiedToken(token: string, publicKey: string) {
  const [header = "", payload = "", signature = ""] = token.split(".");
  const signed = verify(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature, "base64url")
  );
  return {
    signed,
    header: base64UrlJson(header),
    claims: base64UrlJson(payload),
  };
}

beforeEach(() => {
  resetTestDb();
  vi.stubEnv("KNOCK_PUBLIC_API_KEY", "pk_test_cadence");
  vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "feed-channel-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── Tests ───

describe("the app layout's Knock feed config", () => {
  it("gives a signed-in person a short-lived RS256 token for their own feed", async () => {
    const { privateKey, publicKey } = rsaKeyPair();
    vi.stubEnv("KNOCK_SIGNING_KEY", privateKey);
    const liam = createUser("Liam", UserRole.Student);

    const data = await loader(loaderArgs(await requestAs(liam.id)));

    expect(data.knock).toMatchObject({
      publicApiKey: "pk_test_cadence",
      feedChannelId: "feed-channel-id",
    });
    const token = data.knock?.userToken;
    if (!token) throw new Error("expected a user token");
    const { signed, header, claims } = readVerifiedToken(token, publicKey);
    expect(signed).toBe(true);
    expect(header.alg).toBe("RS256");
    expect(claims.sub).toBe(String(liam.id));
    expect(Number(claims.exp)).toBeGreaterThan(Date.now() / 1000);
    expect(Number(claims.exp)).toBeLessThanOrEqual(
      Date.now() / 1000 + 60 * 60 + 5
    );
  });

  it("gives the feed without a token when there is no signing key", async () => {
    vi.stubEnv("KNOCK_SIGNING_KEY", undefined);
    const liam = createUser("Liam", UserRole.Student);

    const data = await loader(loaderArgs(await requestAs(liam.id)));

    expect(data.knock).toEqual({
      publicApiKey: "pk_test_cadence",
      feedChannelId: "feed-channel-id",
      userToken: null,
    });
  });

  it("gives no feed config when there is no public key, so there is no bell", async () => {
    vi.stubEnv("KNOCK_PUBLIC_API_KEY", undefined);
    vi.stubEnv("KNOCK_SIGNING_KEY", rsaKeyPair().privateKey);
    const liam = createUser("Liam", UserRole.Student);

    const data = await loader(loaderArgs(await requestAs(liam.id)));

    expect(data.knock).toBeNull();
  });
});
