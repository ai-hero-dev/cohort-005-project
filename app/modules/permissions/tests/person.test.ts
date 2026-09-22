import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { setCurrentUserId, setDevCountry } from "~/lib/session";
import { createPeople } from "../person.server";

let db: TestDb;
let people: ReturnType<typeof createPeople>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  people = createPeople(db);
});

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/", { headers });
}

/** Signs in through the real session cookie, as the DevUI panel does. */
async function signedInRequest(
  userId: number,
  {
    devCountry,
    headerCountry,
  }: { devCountry?: string; headerCountry?: string } = {}
) {
  let setCookie = await setCurrentUserId(makeRequest(), userId);
  if (devCountry) {
    setCookie = await setDevCountry(
      makeRequest({ Cookie: cookieFrom(setCookie) }),
      devCountry
    );
  }
  const headers: Record<string, string> = { Cookie: cookieFrom(setCookie) };
  if (headerCountry) headers["CF-IPCountry"] = headerCountry;
  return makeRequest(headers);
}

function cookieFrom(setCookie: string) {
  return setCookie.split(";")[0];
}

describe("getPerson", () => {
  it("gives null when signed out", async () => {
    expect(await people.getPerson(makeRequest())).toBeNull();
  });

  it("uses the country header when there's no dev country", async () => {
    const request = await signedInRequest(base.user.id, {
      headerCountry: "BR",
    });

    expect(await people.getPerson(request)).toEqual({
      id: base.user.id,
      role: "student",
      country: "BR",
    });
  });

  it("prefers the dev country over the country header", async () => {
    const request = await signedInRequest(base.user.id, {
      devCountry: "IN",
      headerCountry: "US",
    });

    expect((await people.getPerson(request))?.country).toBe("IN");
  });

  it("gives a null country when the country is unknown", async () => {
    const request = await signedInRequest(base.user.id, {
      headerCountry: "XX",
    });

    expect((await people.getPerson(request))?.country).toBeNull();
  });

  it("calls a Platform Admin platform-admin", async () => {
    const platformAdmin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();

    const person = await people.getPerson(
      await signedInRequest(platformAdmin.id)
    );

    expect(person?.role).toBe("platform-admin");
  });

  it("gives null when the session points at a deleted user", async () => {
    const request = await signedInRequest(base.user.id);
    db.delete(schema.users).where(eq(schema.users.id, base.user.id)).run();

    expect(await people.getPerson(request)).toBeNull();
  });
});

describe("requirePerson", () => {
  it("returns the Person when signed in", async () => {
    const request = await signedInRequest(base.instructor.id);

    expect(await people.requirePerson(request)).toEqual({
      id: base.instructor.id,
      role: "instructor",
      country: null,
    });
  });

  it("throws 401 asking to select a user when signed out", async () => {
    const thrown = await people
      .requirePerson(makeRequest())
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 401 },
      data: "Select a user from the DevUI panel.",
    });
  });
});

describe("requirePlatformAdmin", () => {
  function addPlatformAdmin() {
    return db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();
  }

  it("throws 401 asking to select a user when signed out", async () => {
    const thrown = await people
      .requirePlatformAdmin(makeRequest())
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 401 },
      data: "Select a user from the DevUI panel.",
    });
  });

  it("throws 403 for a Student", async () => {
    const request = await signedInRequest(base.user.id);

    const thrown = await people
      .requirePlatformAdmin(request)
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 403 },
      data: "Only Platform Admins can do that.",
    });
  });

  it("throws 403 for an Instructor", async () => {
    const request = await signedInRequest(base.instructor.id);

    const thrown = await people
      .requirePlatformAdmin(request)
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 403 },
      data: "Only Platform Admins can do that.",
    });
  });

  it("returns the Person for a Platform Admin", async () => {
    const platformAdmin = addPlatformAdmin();
    const request = await signedInRequest(platformAdmin.id, {
      headerCountry: "DE",
    });

    expect(await people.requirePlatformAdmin(request)).toEqual({
      id: platformAdmin.id,
      role: "platform-admin",
      country: "DE",
    });
  });
});

describe("requireInstructorOrPlatformAdmin", () => {
  it("returns the Person for an Instructor", async () => {
    const request = await signedInRequest(base.instructor.id);

    expect(await people.requireInstructorOrPlatformAdmin(request)).toEqual({
      id: base.instructor.id,
      role: "instructor",
      country: null,
    });
  });

  it("throws 403 for a Student", async () => {
    const request = await signedInRequest(base.user.id);

    const thrown = await people
      .requireInstructorOrPlatformAdmin(request)
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 403 },
      data: "Only Instructors and Platform Admins can do that.",
    });
  });

  it("returns the Person for a Platform Admin", async () => {
    const platformAdmin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();

    const person = await people.requireInstructorOrPlatformAdmin(
      await signedInRequest(platformAdmin.id)
    );

    expect(person).toEqual({
      id: platformAdmin.id,
      role: "platform-admin",
      country: null,
    });
  });

  it("throws 401 when signed out", async () => {
    const thrown = await people
      .requireInstructorOrPlatformAdmin(makeRequest())
      .catch((error) => error);

    expect(thrown).toMatchObject({
      init: { status: 401 },
      data: "Select a user from the DevUI panel.",
    });
  });
});
