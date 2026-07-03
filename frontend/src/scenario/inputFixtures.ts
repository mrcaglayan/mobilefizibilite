import { Inputs } from "@/src/api/client";
import { preserveUnknownInputFields } from "@/src/scenario/patch";

export const PRODUCTION_INPUT_SHAPE_FIXTURE: Inputs = {
  temelBilgiler: {
    programType: "local",
    kademeler: {
      okulOncesi: { enabled: true },
      ilkokul: { enabled: true },
      ortaokul: { enabled: true },
      lise: { enabled: false },
    },
    performans: {
      degerlendirme: "",
    },
    okulEgitimBilgileri: {
      egitimDili: "",
      takvim: "",
    },
    inflation: {
      y1: 0,
      y2: 0,
      y3: 0,
    },
  },
  kapasite: {
    currentStudents: 0,
    years: {
      y1: 0,
      y2: 0,
      y3: 0,
    },
    byKademe: {
      okulOncesi: { y1: 0, y2: 0, y3: 0 },
      ilkokul: { y1: 0, y2: 0, y3: 0 },
      ortaokul: { y1: 0, y2: 0, y3: 0 },
      lise: { y1: 0, y2: 0, y3: 0 },
    },
  },
  gradesYears: {
    y1: {},
    y2: {},
    y3: {},
  },
  gradesCurrent: {},
  ik: {
    years: {
      y1: { localStaff: [], internationalStaff: [] },
      y2: { localStaff: [], internationalStaff: [] },
      y3: { localStaff: [], internationalStaff: [] },
    },
    hq: {},
    assumptions: {},
  },
  gelirler: {
    tuition: {
      rows: [
        {
          id: "tuition-example",
          kademe: "ilkokul",
          grade: "1",
          amount: 0,
          studentCount: 0,
        },
      ],
    },
    nonEducationFees: { rows: [] },
    dormitory: { rows: [] },
    otherInstitutionIncome: { rows: [] },
  },
  discounts: {
    rows: [],
  },
  giderler: {
    isletme: {
      items: {},
    },
    ogrenimDisi: {
      items: {},
    },
    yurt: {
      items: {},
    },
  },
};

export function createProductionInputShapeFixture(overrides: Partial<Inputs> = {}): Inputs {
  const base = JSON.parse(JSON.stringify(PRODUCTION_INPUT_SHAPE_FIXTURE)) as Inputs;
  return preserveUnknownInputFields(base, overrides);
}
