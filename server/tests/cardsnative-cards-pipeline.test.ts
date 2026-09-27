// SchoolSafe — tests du pipeline complet de production de cartes élèves.
// RED puis GREEN : ces tests reproduisent les problèmes réels du pipeline
// Cartes (projection, readiness, credential QR serveur, ZIP, manifest).
import { describe, expect, it } from "vitest";
import type { BusinessPool } from "../src/db/pool.js";
import { createCardsNativeService } from "../src/cardsnative/service.js";
import { signCardNumber } from "../src/security/service.js";
import type { RequestContext } from "../src/db/context.js";

type QueryCall = { sql: string; params: unknown[] };

const SESSION = {
  userId: "55555555-0000-4000-8000-000000000001",
  profileId: "66666666-0000-4000-8000-000000000001",
  schoolId: "33333333-0000-4000-8000-000000000001",
};

const STUDENT_ID = "44444444-0000-4000-8000-000000000001";
const CLASS_ID = "22222222-0000-4000-8000-000000000001";
const YEAR_ID = "88888888-0000-4000-8000-000000000001";
const TEACHER_ID = "77777777-0000-4000-8000-000000000001";

function context(): RequestContext {
  return { ...SESSION, requestId: "req-1" };
}

// Ligne SQL plate renvoyée par la jointure de projection (l'appel du service
// s'attend à une ligne de base de données, pas à l'objet métier déjà mappé).
const READY_ROW = {
  id: STUDENT_ID,
  matricule: "JT-2026-001",
  first_name: "Jean",
  middle_name: "Kabasele",
  last_name: "Test",
  date_of_birth: "2015-04-12",
  photo_path: "/uploads/students/jean.png",
  lifecycle_status: "active",
  class_id: CLASS_ID,
  class_name: "3ème A",
  cycle_key: "primary",
  class_option: null,
  card_color: "#e9a515",
  card_color_soft: "#f9e8b8",
  card_color_dark: "#b87e0d",
  card_family: "A",
  card_variant: null,
  card_pat: "auto",
  card_pat_style: null,
  teacher_profile_id: TEACHER_ID,
  teacher_name: "Maîtresse Mukendi",
  academic_year_id: YEAR_ID,
  academic_year_label: "2026-2027",
  school_name: "SchoolSafe Test",
  school_name_en: "SchoolSafe Test EN",
  school_logo_path: "/schoolsafe-logo.png",
  school_motto: "Un enfant protégé",
  school_director_name: "Directeur Kalala",
  address: "12 avenue de la Paix",
  phone: "+243900000000",
  email: "ecole@schoolsafe.cd",
  website_url: "https://ecole.schoolsafe.cd",
  province: "Kinshasa",
  city: "Kinshasa",
  guardians: [
    { id: "99999999-0000-4000-8000-000000000001", full_name: "Maman Tshala", guardian_type: "mere", phone: "+243810000000", is_primary: true, is_authorized_pickup: true },
    { id: "99999999-0000-4000-8000-000000000002", full_name: "Tonton Ilunga", guardian_type: "tuteur", phone: "+243820000000", is_primary: false, is_authorized_pickup: true },
  ],
};

const EXPECTED_PROJECTION = {
  student: {
    id: STUDENT_ID,
    matricule: "JT-2026-001",
    first_name: "Jean",
    middle_name: "Kabasele",
    last_name: "Test",
    date_of_birth: "2015-04-12",
    photo_path: "/uploads/students/jean.png",
    lifecycle_status: "active",
  },
  school: {
    name: "SchoolSafe Test",
    name_en: "SchoolSafe Test EN",
    logo_path: "/schoolsafe-logo.png",
    motto: "Un enfant protégé",
    director_name: "Directeur Kalala",
    address: "12 avenue de la Paix",
    phone: "+243900000000",
    email: "ecole@schoolsafe.cd",
    website_url: "https://ecole.schoolsafe.cd",
  },
  class: {
    id: CLASS_ID,
    name: "3ème A",
    cycle_key: "primary",
    option: null,
    card_color: "#e9a515",
    card_color_soft: "#f9e8b8",
    card_color_dark: "#b87e0d",
    card_family: "A",
    card_variant: null,
    card_pat: "auto",
    card_pat_style: null,
  },
  academic_year: { id: YEAR_ID, label: "2026-2027" },
  teacher: { id: TEACHER_ID, name: "Maîtresse Mukendi" },
  primary_guardian: {
    id: "99999999-0000-4000-8000-000000000001",
    full_name: "Maman Tshala",
    guardian_type: "mere",
    phone: "+243810000000",
  },
  authorized_persons: [
    {
      id: "99999999-0000-4000-8000-000000000002",
      full_name: "Tonton Ilunga",
      guardian_type: "tuteur",
      phone: "+243820000000",
      slot_no: 1,
    },
  ],
};

// ————— Pool factice piloté par un scénario de réponses —————
// Répond selon les tables détectées dans le SQL, comme le vrai PostgreSQL.
type Rows = Record<string, unknown>;

function scenarioPool(rowsFor: (sql: string, params: unknown[]) => Rows[]): BusinessPool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      const s = sql.trim();
      if (s.startsWith("BEGIN") || s.startsWith("COMMIT") || s.startsWith("ROLLBACK") || s.includes("api.set_request_context")) {
        return { rows: [] };
      }
      return { rows: rowsFor(s, params ?? []) };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function loggingPool(log: QueryCall[], rowsFor: (sql: string, params: unknown[]) => Rows[]): BusinessPool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params: params ?? [] });
      const s = sql.trim();
      if (s.startsWith("BEGIN") || s.startsWith("COMMIT") || s.startsWith("ROLLBACK") || s.includes("api.set_request_context")) {
        return { rows: [] };
      }
      return { rows: rowsFor(s, params ?? []) };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function defaultRowsFor(projection: Rows | null, activeCard: Rows | null): (sql: string, params: unknown[]) => Rows[] {
  return (sql, params) => {
    if (sql.includes("from app.students") && sql.includes("app.classes")) {
      return projection ? [projection] : [];
    }
    if (sql.includes("from app.pickup_authorizations")) {
      // Tonton Ilunga est autorisé au créneau 1 — les autorisations ACTIVES seulement.
      if (!projection || !(projection as Record<string, unknown>).guardians) return [];
      return [{ guardian_id: "99999999-0000-4000-8000-000000000002", slot_no: 1 }];
    }
    if (sql.includes("from app.student_cards") && sql.includes("status = 'active'")) {
      return activeCard ? [activeCard] : [];
    }
    if (sql.includes("insert into app.student_cards")) {
      return [{ id: "new-card-1", card_number: params[3], signature: params[5], status: "active" }];
    }
    return [];
  };
}

function readyPool(log: QueryCall[], overrides: Partial<{ row: Rows | null; activeCard: Rows | null }> = {}) {
  const rowsFor = defaultRowsFor(
    overrides.row !== undefined ? overrides.row : READY_ROW,
    overrides.activeCard !== undefined ? overrides.activeCard : null,
  );
  return loggingPool(log, rowsFor);
}

describe("cardsnative — projection carte (source de vérité unique)", () => {
  it("getCardProjection retourne l'objet métier complet pour un élève", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    expect(projection).not.toBeNull();
    expect(projection!.student.matricule).toBe("JT-2026-001");
    expect(projection!.student.middle_name).toBe("Kabasele");
    expect(projection!.student.date_of_birth).toBe("2015-04-12");
    expect(projection!.student.photo_path).toBe("/uploads/students/jean.png");
    expect(projection!.school.name).toBe("SchoolSafe Test");
    expect(projection!.school.address).toBe("12 avenue de la Paix");
    expect(projection!.class.name).toBe("3ème A");
    // Le titulaire vient de app.classes.teacher_profile_id → profil existant
    expect(projection!.teacher.name).toBe("Maîtresse Mukendi");
    expect(projection!.academic_year.label).toBe("2026-2027");
    expect(projection!.primary_guardian).not.toBeNull();
    expect(projection!.primary_guardian!.full_name).toBe("Maman Tshala");
    expect(projection!.authorized_persons.length).toBe(1);
    // Contexte serveur : BEGIN → set_request_context → requêtes → COMMIT.
    const beginIdx = log.findIndex((c) => c.sql === "BEGIN");
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(log[beginIdx + 1].sql).toContain("api.set_request_context");
    expect(log[beginIdx + 1].params.slice(0, 3)).toEqual([SESSION.userId, SESSION.profileId, SESSION.schoolId]);
    expect(log[beginIdx + 2].sql).toContain("from app.students");
    expect(log[log.length - 1].sql).toBe("COMMIT");
  });

  it("élève d'une autre école : aucune donnée (isolation par session serveur)", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, { row: null }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    expect(projection).toBeNull();
    const projectionSql = log.find((call) => call.sql.includes("from app.students"))!;
    expect(projectionSql).toBeDefined();
    // L'école vient de la session serveur (paramètre), jamais du navigateur.
    expect(projectionSql.params).toContain(SESSION.schoolId);
  });

  it("la projection lit teacher_profile_id (pas l'ancien teacher_id)", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log));
    await service.getCardProjection(context(), STUDENT_ID);
    const projectionSql = log.find((call) => call.sql.includes("app.classes"))!;
    expect(projectionSql.sql).toContain("teacher_profile_id");
    expect(projectionSql.sql).not.toMatch(/(^|[^_])teacher_id/);
  });
});

describe("cardsnative — readiness CARD_NOT_READY", () => {
  it("élève sans photo ni Parent : missing contient photo et primary_guardian", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      row: {
        ...READY_ROW,
        photo_path: null,
        guardians: [],
      },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    const missing = service.cardReadinessMissing(projection!);
    expect(missing).toContain("photo");
    expect(missing).toContain("primary_guardian");
    expect(missing).not.toContain("matricule");
    expect(missing).not.toContain("lifecycle_status");
  });

  it("brouillon non-actif : lifecycle_status manque", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      row: { ...READY_ROW, lifecycle_status: "draft" },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    expect(service.cardReadinessMissing(projection!)).toContain("lifecycle_status");
  });

  it("aucune année scolaire active : academic_year manque", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      row: { ...READY_ROW, academic_year_id: null, academic_year_label: null },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    expect(service.cardReadinessMissing(projection!)).toContain("academic_year");
  });

  it("élève complet : aucune donnée manquante", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    expect(service.cardReadinessMissing(projection!)).toEqual([]);
  });
});

describe("cardsnative — credential QR côté serveur (contrat sécurité)", () => {
  it("ensureActiveCard émet une carte active signée HMAC (base64url, 32 caractères)", async () => {
    process.env.CARD_HMAC_SECRET = "test-secret-cards";
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    await service.ensureActiveCard(context(), projection!);
    // Contrat sécurité : HMAC-SHA256(card_number, secret) base64url tronqué à 32
    // Paramètres INSERT : [school_id, student_id, card_number, card_secret, signature]
    const insertCall = log.find((call) => call.sql.includes("insert into app.student_cards"));
    expect(insertCall).toBeDefined();
    const cardNumber = insertCall!.params[2] as string;
    const cardSecret = insertCall!.params[3] as string;
    const signature = insertCall!.params[4] as string;
    expect(cardNumber).toMatch(/^SS-/);
    expect(signature).toBe(signCardNumber(cardNumber, "test-secret-cards"));
    expect(signature).toHaveLength(32);
    // card_secret est un UUID serveur, jamais dérivé du navigateur
    expect(cardSecret).toMatch(/^[0-9a-f-]{36}$/);
    // Le QR suit le contrat officiel, jamais schoolsafe://student/<matricule>
    const qr = service.buildQrPayload({ card_number: cardNumber, signature });
    expect(qr).toBe(`schoolsafe://card/${cardNumber}/${signature}`);
  });

  it("ensureActiveCard réutilise la carte active existante (pas de double émission)", async () => {
    process.env.CARD_HMAC_SECRET = "test-secret-cards";
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      activeCard: { id: "card-1", card_number: "SS-EXIST-1", signature: "sig", status: "active" },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    const card = await service.ensureActiveCard(context(), projection!);
    expect(card!.card_number).toBe("SS-EXIST-1");
    expect(log.filter((call) => call.sql.includes("insert into app.student_cards")).length).toBe(0);
  });

  it("sans CARD_HMAC_SECRET : échec propre, jamais de signature fausse", async () => {
    const saved = process.env.CARD_HMAC_SECRET;
    delete process.env.CARD_HMAC_SECRET;
    try {
      const log: QueryCall[] = [];
      const service = createCardsNativeService(readyPool(log));
      const projection = await service.getCardProjection(context(), STUDENT_ID);
      await expect(service.ensureActiveCard(context(), projection!)).rejects.toThrow(/CARD_HMAC_SECRET/);
      // Aucune inscription de carte sans secret
      expect(log.find((call) => call.sql.includes("insert into app.student_cards"))).toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.CARD_HMAC_SECRET = saved;
    }
  });
});

describe("cardsnative — package ZIP individuel", () => {
  const RECTO_PNG = Buffer.from("recto-png-bytes-" + "0".repeat(120), "utf8");
  const VERSO_PNG = Buffer.from("verso-png-bytes-" + "1".repeat(120), "utf8");

  it("buildCardPackage retourne un ZIP valide + manifest sans aucun secret", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      activeCard: { id: "card-1", card_number: "SS-CARD-1", signature: "sig-ok", status: "active" },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    const pkg = await service.buildCardPackage(context(), {
      projection: projection!,
      card: { id: "card-1", card_number: "SS-CARD-1", signature: "sig-ok", status: "active" },
      recto: RECTO_PNG,
      verso: VERSO_PNG,
    });
    expect(pkg.zip).toBeInstanceOf(Buffer);
    expect(pkg.zip.length).toBeGreaterThan(100);
    expect(pkg.zip.subarray(0, 2).toString("latin1")).toBe("PK");
    // Nommage sûr : Carte_<MATRICULE>_<NOM>_<PRENOM>.zip
    expect(pkg.filename).toBe("Carte_JT-2026-001_Test_Jean.zip");
    expect(pkg.folderName).toBe("Carte_Test_Jean");
    // Manifest : uniquement les métadonnées non secrètes utiles
    const manifest = pkg.manifest as Record<string, unknown>;
    expect(manifest.student_id).toBe(STUDENT_ID);
    expect(manifest.matricule).toBe("JT-2026-001");
    expect(manifest.student_name).toBe("Jean Kabasele Test");
    expect(manifest.class_name).toBe("3ème A");
    expect(manifest.academic_year).toBe("2026-2027");
    expect(manifest.card_number).toBe("SS-CARD-1");
    expect(manifest.version).toBe(1);
    expect(manifest.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(manifest.recto_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.verso_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest).sort()).toEqual([
      "academic_year", "card_number", "class_name", "generated_at",
      "matricule", "recto_sha256", "student_id", "student_name", "verso_sha256", "version",
    ].sort());
    const manifestJson = JSON.stringify(manifest);
    expect(manifestJson).not.toMatch(/card_secret|signature|hmac|secret/i);
  });

  it("buildCardPackage refuse un élève non prêt (CARD_NOT_READY avec missing)", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log, {
      row: {
        ...READY_ROW,
        photo_path: null,
        guardians: [],
      },
    }));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    try {
      await service.buildCardPackage(context(), {
        projection: projection!,
        card: null,
        recto: RECTO_PNG,
        verso: VERSO_PNG,
      });
      expect.unreachable("doit refuser un élève non prêt");
    } catch (err) {
      expect((err as Error).message).toMatch(/CARD_NOT_READY/);
      expect((err as Error).message).toContain("photo");
    }
  });

  it("buildCardPackage refuse sans carte active (pas de QR, pas de package)", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(readyPool(log));
    const projection = await service.getCardProjection(context(), STUDENT_ID);
    await expect(service.buildCardPackage(context(), {
      projection: projection!,
      card: null,
      recto: RECTO_PNG,
      verso: VERSO_PNG,
    })).rejects.toThrow(/carte active|CARD_NOT_READY/i);
  });
});

describe("cardsnative — ZIP de lot (classe)", () => {
  it("le nommage du lot suit Cartes_<CLASSE>_<ANNEE>", () => {
    const service = createCardsNativeService(readyPool([], {}));
    expect(service.buildBatchZipName("3ème A", "2026-2027")).toBe("Cartes_3ème A_2026-2027.zip");
    // Caractères interdits dans un nom de fichier neutralisés
    expect(service.buildBatchZipName('7C/BS "2"', "2026-2027")).toBe("Cartes_7C-BS -2-_2026-2027.zip");
  });

  it("les dossiers d'élèves dans le lot suivent <matricule>_<nom>_<prenom>", () => {
    const service = createCardsNativeService(readyPool([], {}));
    expect(service.buildBatchEntryFolder("JT-2026-001", "Test", "Jean")).toBe("JT-2026-001_Test_Jean");
  });
});
