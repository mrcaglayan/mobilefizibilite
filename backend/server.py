"""
Feasibility Studio — Mobile Demo Backend
=========================================
This is a lightweight in-memory demo backend that mirrors the API contract of
the original Node/Express/MySQL feasibility app so the mobile client can be
previewed without needing the real backend running.

Endpoints implemented (a subset used by the mobile MVP):
- POST /api/auth/login
- GET  /api/auth/me
- GET  /api/schools
- GET  /api/schools/{school_id}
- GET  /api/schools/{school_id}/scenarios
- GET  /api/schools/{school_id}/scenarios/{scenario_id}/inputs
- PUT  /api/schools/{school_id}/scenarios/{scenario_id}/inputs
- POST /api/schools/{school_id}/scenarios/{scenario_id}/calculate
- GET  /api/schools/{school_id}/scenarios/{scenario_id}/report

To point the mobile client at your REAL backend, change EXPO_PUBLIC_API_BASE_URL
in /app/frontend/.env to your Node.js server URL (e.g. https://api.mydomain.com).
"""

from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from pathlib import Path
from datetime import datetime, timezone
import os
import uuid
import copy
import logging
import base64
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="Feasibility Studio Demo API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feasibility-demo")


# ---------------------------------------------------------------------------
# Fake JWT (base64 payload, no signature verification — demo only)
# ---------------------------------------------------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "iat": _now()}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"demo.{raw}.sig"


def decode_token(token: str) -> Optional[str]:
    try:
        _, raw, _ = token.split(".")
        raw += "=" * (-len(raw) % 4)
        payload = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
        return payload.get("sub")
    except Exception:
        return None


def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = decode_token(token)
    if not user_id or user_id not in USERS:
        raise HTTPException(status_code=401, detail="Invalid token")
    return USERS[user_id]


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
USERS: Dict[str, Dict[str, Any]] = {
    "u_demo": {
        "id": "u_demo",
        "email": "demo@feasibility.io",
        "password": "demo1234",
        "role": "user",
        "country_id": 1,
        "country_name": "Türkiye",
        "must_reset_password": False,
        "permissions": ["schools.read", "scenarios.write"],
    },
    "u_admin": {
        "id": "u_admin",
        "email": "admin@feasibility.io",
        "password": "admin1234",
        "role": "admin",
        "country_id": 1,
        "country_name": "Türkiye",
        "must_reset_password": False,
        "permissions": ["*"],
    },
}


def _default_inputs() -> Dict[str, Any]:
    return {
        "temelBilgiler": {
            "okulAdi": "Örnek Okul",
            "kampus": "Merkez",
            "sehir": "İstanbul",
            "kademeler": ["ilkokul", "ortaokul", "lise"],
            "baslangicYili": 2026,
            "planlamaYili": 3,
            "kur": "TRY",
            "notlar": "",
        },
        "kapasite": {
            "toplamKapasite": 800,
            "siniflarSayisi": 32,
            "sinifBasinaOgrenci": 25,
            "hedefDoluluk": 90,
        },
        "ik": {
            "ogretmenSayisi": 55,
            "idariPersonel": 12,
            "destekPersonel": 20,
            "ortalamaMaas": 42000,
            "yillikArtis": 25,
        },
        "gelirler": {
            "yillikUcret": 180000,
            "kayitUcreti": 15000,
            "ekGelirler": 250000,
            "indirimOrani": 10,
        },
        "giderler": {
            "personel": 3200000,
            "kira": 850000,
            "islektme": 620000,
            "yatirim": 400000,
            "digerGiderler": 180000,
        },
        "discounts": {"kardes": 15, "personel": 50, "burslu": 100},
    }


SCHOOLS: List[Dict[str, Any]] = [
    {
        "id": "s1",
        "name": "İstanbul Merkez Kampüsü",
        "city": "İstanbul",
        "country_id": 1,
        "created_at": "2025-11-01T09:00:00Z",
        "updated_at": "2026-01-20T14:32:00Z",
        "progress": 78,
    },
    {
        "id": "s2",
        "name": "Ankara Çankaya Kampüsü",
        "city": "Ankara",
        "country_id": 1,
        "created_at": "2025-12-10T09:00:00Z",
        "updated_at": "2026-02-01T10:12:00Z",
        "progress": 42,
    },
    {
        "id": "s3",
        "name": "İzmir Karşıyaka Kampüsü",
        "city": "İzmir",
        "country_id": 1,
        "created_at": "2026-01-05T09:00:00Z",
        "updated_at": "2026-02-08T11:20:00Z",
        "progress": 15,
    },
]

SCENARIOS: Dict[str, List[Dict[str, Any]]] = {
    "s1": [
        {
            "id": "sc1a",
            "school_id": "s1",
            "name": "2026-2027 Ana Senaryo",
            "input_currency": "TRY",
            "fx_usd_to_local": 34.5,
            "local_currency_code": "TRY",
            "created_at": "2025-11-05T10:00:00Z",
            "updated_at": "2026-01-20T14:32:00Z",
            "state": "draft",
        },
        {
            "id": "sc1b",
            "school_id": "s1",
            "name": "2026-2027 Alternatif A",
            "input_currency": "TRY",
            "fx_usd_to_local": 34.5,
            "local_currency_code": "TRY",
            "created_at": "2025-12-20T10:00:00Z",
            "updated_at": "2026-01-15T12:00:00Z",
            "state": "submitted",
        },
    ],
    "s2": [
        {
            "id": "sc2a",
            "school_id": "s2",
            "name": "2026-2027 Baz Senaryo",
            "input_currency": "TRY",
            "fx_usd_to_local": 34.5,
            "local_currency_code": "TRY",
            "created_at": "2025-12-11T10:00:00Z",
            "updated_at": "2026-02-01T10:12:00Z",
            "state": "draft",
        },
    ],
    "s3": [
        {
            "id": "sc3a",
            "school_id": "s3",
            "name": "2026-2027 İlk Taslak",
            "input_currency": "TRY",
            "fx_usd_to_local": 34.5,
            "local_currency_code": "TRY",
            "created_at": "2026-01-05T10:00:00Z",
            "updated_at": "2026-02-08T11:20:00Z",
            "state": "draft",
        },
    ],
}

INPUTS: Dict[str, Dict[str, Any]] = {}  # scenario_id -> inputs


def _get_inputs(scenario_id: str) -> Dict[str, Any]:
    if scenario_id not in INPUTS:
        INPUTS[scenario_id] = _default_inputs()
    return INPUTS[scenario_id]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    email: str
    password: str


class InputsBody(BaseModel):
    inputs: Dict[str, Any]
    modifiedResources: Optional[List[str]] = None
    modifiedPaths: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"service": "feasibility-demo", "status": "ok", "time": _now()}


@api.post("/auth/login")
async def login(body: LoginBody):
    for user in USERS.values():
        if user["email"].lower() == body.email.lower() and user["password"] == body.password:
            safe = {k: v for k, v in user.items() if k != "password"}
            return {"token": make_token(user["id"]), "user": safe}
    raise HTTPException(status_code=401, detail="Geçersiz e-posta veya parola")


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {k: v for k, v in user.items() if k != "password"}


@api.get("/schools")
async def list_schools(user=Depends(get_current_user)):
    return {"items": SCHOOLS, "total": len(SCHOOLS)}


@api.get("/schools/{school_id}")
async def get_school(school_id: str, user=Depends(get_current_user)):
    for s in SCHOOLS:
        if s["id"] == school_id:
            return s
    raise HTTPException(status_code=404, detail="School not found")


@api.get("/schools/{school_id}/scenarios")
async def list_scenarios(school_id: str, user=Depends(get_current_user)):
    items = SCENARIOS.get(school_id, [])
    return {"items": items, "total": len(items)}


@api.get("/schools/{school_id}/scenarios/{scenario_id}/inputs")
async def get_inputs(school_id: str, scenario_id: str, user=Depends(get_current_user)):
    return {"inputs": _get_inputs(scenario_id)}


@api.put("/schools/{school_id}/scenarios/{scenario_id}/inputs")
async def save_inputs(school_id: str, scenario_id: str, body: InputsBody, user=Depends(get_current_user)):
    INPUTS[scenario_id] = copy.deepcopy(body.inputs)
    # bump updated_at on scenario
    for sc in SCENARIOS.get(school_id, []):
        if sc["id"] == scenario_id:
            sc["updated_at"] = _now()
    return {"ok": True, "updated_at": _now()}


def _compute_report(inputs: Dict[str, Any]) -> Dict[str, Any]:
    cap = inputs.get("kapasite", {})
    gel = inputs.get("gelirler", {})
    gid = inputs.get("giderler", {})
    tb = inputs.get("temelBilgiler", {})

    kapasite = float(cap.get("toplamKapasite", 0) or 0)
    doluluk = float(cap.get("hedefDoluluk", 0) or 0) / 100.0
    aktif_ogr = int(kapasite * doluluk)

    yil_ucret = float(gel.get("yillikUcret", 0) or 0)
    kayit = float(gel.get("kayitUcreti", 0) or 0)
    indirim = float(gel.get("indirimOrani", 0) or 0) / 100.0
    ek = float(gel.get("ekGelirler", 0) or 0)

    brut_ogrenim = aktif_ogr * yil_ucret
    net_ogrenim = brut_ogrenim * (1 - indirim)
    kayit_gel = aktif_ogr * kayit
    toplam_gelir = net_ogrenim + kayit_gel + ek

    personel = float(gid.get("personel", 0) or 0)
    kira = float(gid.get("kira", 0) or 0)
    isletme = float(gid.get("islektme", 0) or 0)
    yatirim = float(gid.get("yatirim", 0) or 0)
    diger = float(gid.get("digerGiderler", 0) or 0)
    toplam_gider = personel + kira + isletme + yatirim + diger

    faaliyet_kar = toplam_gelir - toplam_gider
    marj = (faaliyet_kar / toplam_gelir * 100) if toplam_gelir else 0.0
    ogr_bas_gelir = (toplam_gelir / aktif_ogr) if aktif_ogr else 0.0
    ogr_bas_gider = (toplam_gider / aktif_ogr) if aktif_ogr else 0.0

    kur = tb.get("kur", "TRY")

    return {
        "currency": kur,
        "kpis": {
            "aktifOgrenci": aktif_ogr,
            "toplamKapasite": kapasite,
            "doluluk": doluluk * 100,
            "toplamGelir": toplam_gelir,
            "toplamGider": toplam_gider,
            "faaliyetKari": faaliyet_kar,
            "karMarji": marj,
            "ogrenciBasinaGelir": ogr_bas_gelir,
            "ogrenciBasinaGider": ogr_bas_gider,
        },
        "gelirDagilim": [
            {"label": "Net Öğrenim Ücreti", "value": net_ogrenim},
            {"label": "Kayıt Ücreti", "value": kayit_gel},
            {"label": "Ek Gelirler", "value": ek},
        ],
        "giderDagilim": [
            {"label": "Personel", "value": personel},
            {"label": "Kira", "value": kira},
            {"label": "İşletme", "value": isletme},
            {"label": "Yatırım", "value": yatirim},
            {"label": "Diğer", "value": diger},
        ],
    }


@api.post("/schools/{school_id}/scenarios/{scenario_id}/calculate")
async def calculate(school_id: str, scenario_id: str, user=Depends(get_current_user)):
    inputs = _get_inputs(scenario_id)
    return {"ok": True, "report": _compute_report(inputs)}


# ---------------------------------------------------------------------------
# Admin: users + countries (mirror of Node.js /api/admin/*)
# ---------------------------------------------------------------------------
COUNTRIES: List[Dict[str, Any]] = [
    {"id": 1, "name": "Türkiye", "code": "TR", "region": "EMEA"},
    {"id": 2, "name": "Azerbaycan", "code": "AZ", "region": "EMEA"},
    {"id": 3, "name": "Kazakistan", "code": "KZ", "region": "APAC"},
]

_admin_user_counter = 100


def _require_admin(user: Dict[str, Any]):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Yönetici yetkisi gerekiyor")


@api.get("/admin/users")
async def admin_list_users(unassigned: Optional[str] = None, user=Depends(get_current_user)):
    _require_admin(user)
    users = []
    for u in USERS.values():
        if unassigned == "1" and u.get("country_id"):
            continue
        users.append({k: v for k, v in u.items() if k != "password"})
    return {"users": users, "total": len(users)}


class CreateUserBody(BaseModel):
    full_name: Optional[str] = None
    email: str
    password: str
    role: str = "user"
    country_id: Optional[int] = None
    country_code: Optional[str] = None


@api.post("/admin/users")
async def admin_create_user(body: CreateUserBody, user=Depends(get_current_user)):
    _require_admin(user)
    global _admin_user_counter
    valid_roles = ["admin", "user", "principal", "hr", "manager", "accountant"]
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    for u in USERS.values():
        if u["email"].lower() == body.email.lower():
            raise HTTPException(status_code=409, detail="Email already registered")
    country = None
    if body.country_id is not None:
        country = next((c for c in COUNTRIES if c["id"] == body.country_id), None)
    elif body.country_code:
        country = next((c for c in COUNTRIES if c["code"].upper() == body.country_code.upper()), None)
    _admin_user_counter += 1
    uid = f"u_{_admin_user_counter}"
    new_user = {
        "id": uid,
        "full_name": body.full_name,
        "email": body.email,
        "password": body.password,
        "role": body.role,
        "country_id": country["id"] if country else None,
        "country_name": country["name"] if country else None,
        "country_code": country["code"] if country else None,
        "region": country["region"] if country else None,
        "must_reset_password": True,
        "permissions": [],
    }
    USERS[uid] = new_user
    return {k: v for k, v in new_user.items() if k != "password"}


class UserRoleBody(BaseModel):
    role: str


@api.patch("/admin/users/{user_id}/role")
async def admin_update_role(user_id: str, body: UserRoleBody, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id not in USERS:
        raise HTTPException(status_code=404, detail="User not found")
    valid_roles = ["admin", "user", "principal", "hr", "manager", "accountant"]
    if body.role not in valid_roles:
        raise HTTPException(status_code=400, detail="Invalid role")
    USERS[user_id]["role"] = body.role
    return {k: v for k, v in USERS[user_id].items() if k != "password"}


class UserCountryBody(BaseModel):
    country_id: Optional[int] = None
    country_code: Optional[str] = None


@api.patch("/admin/users/{user_id}/country")
async def admin_assign_country(user_id: str, body: UserCountryBody, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id not in USERS:
        raise HTTPException(status_code=404, detail="User not found")
    country = None
    if body.country_id is not None:
        country = next((c for c in COUNTRIES if c["id"] == body.country_id), None)
    elif body.country_code:
        country = next((c for c in COUNTRIES if c["code"].upper() == body.country_code.upper()), None)
    if not country:
        raise HTTPException(status_code=400, detail="country_id or country_code is required")
    USERS[user_id]["country_id"] = country["id"]
    USERS[user_id]["country_name"] = country["name"]
    USERS[user_id]["country_code"] = country["code"]
    USERS[user_id]["region"] = country["region"]
    return {k: v for k, v in USERS[user_id].items() if k != "password"}


class ResetPasswordBody(BaseModel):
    password: Optional[str] = None


@api.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, body: ResetPasswordBody, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id not in USERS:
        raise HTTPException(status_code=404, detail="User not found")
    import secrets
    import string
    pw = body.password if body.password else "".join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
    )
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    USERS[user_id]["password"] = pw
    USERS[user_id]["must_reset_password"] = True
    return {
        "ok": True,
        "user_id": user_id,
        "email": USERS[user_id]["email"],
        "temporary_password": pw,
        "must_reset_password": True,
    }


@api.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    if user_id not in USERS:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    USERS.pop(user_id, None)
    return {"ok": True}


@api.get("/admin/countries")
async def admin_list_countries(user=Depends(get_current_user)):
    _require_admin(user)
    return COUNTRIES


class CreateCountryBody(BaseModel):
    name: str
    code: str
    region: str


@api.post("/admin/countries")
async def admin_create_country(body: CreateCountryBody, user=Depends(get_current_user)):
    _require_admin(user)
    name = body.name.strip()
    code = body.code.strip().upper()
    region = body.region.strip()
    if not name or not code or not region:
        raise HTTPException(status_code=400, detail="name, code, and region are required")
    if any(c["code"].upper() == code for c in COUNTRIES):
        raise HTTPException(status_code=409, detail="Country code already exists")
    new_id = max((c["id"] for c in COUNTRIES), default=0) + 1
    c = {"id": new_id, "name": name, "code": code, "region": region}
    COUNTRIES.append(c)
    return c


# Add country_id to seed schools if missing
for s in SCHOOLS:
    s.setdefault("country_id", 1)
    s.setdefault("status", "active")


@api.get("/admin/countries/{country_id}/schools")
async def admin_list_country_schools(
    country_id: int,
    includeClosed: Optional[str] = None,
    user=Depends(get_current_user),
):
    _require_admin(user)
    include_closed = str(includeClosed or "1") == "1"
    rows = []
    for s in SCHOOLS:
        if int(s.get("country_id", 0)) != country_id:
            continue
        if not include_closed and s.get("status") != "active":
            continue
        rows.append(s)
    return rows


class CreateSchoolBody(BaseModel):
    name: str


@api.post("/admin/countries/{country_id}/schools")
async def admin_create_country_school(
    country_id: int, body: CreateSchoolBody, user=Depends(get_current_user),
):
    _require_admin(user)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    country = next((c for c in COUNTRIES if c["id"] == country_id), None)
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    if any(s.get("country_id") == country_id and s.get("name") == name for s in SCHOOLS):
        raise HTTPException(status_code=409, detail="School already exists for this country")
    new_id = f"s_{len(SCHOOLS) + 1}_{country_id}"
    school = {
        "id": new_id,
        "name": name,
        "city": country["name"],
        "country_id": country_id,
        "status": "active",
        "created_at": _now(),
        "updated_at": _now(),
        "progress": 0,
    }
    SCHOOLS.append(school)
    SCENARIOS[new_id] = []
    return school


class UpdateSchoolBody(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


@api.patch("/admin/schools/{school_id}")
async def admin_update_school(
    school_id: str, body: UpdateSchoolBody, user=Depends(get_current_user),
):
    _require_admin(user)
    school = next((s for s in SCHOOLS if str(s["id"]) == str(school_id)), None)
    if not school:
        raise HTTPException(status_code=404, detail="School not found")
    if body.name is None and body.status is None:
        raise HTTPException(status_code=400, detail="name or status is required")
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name is required")
        school["name"] = n
    if body.status is not None:
        if body.status not in ("active", "closed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        school["status"] = body.status
    school["updated_at"] = _now()
    return school


# ---------------------------------------------------------------------------
# Approvals — scenarios queue + country approval batches
# ---------------------------------------------------------------------------
# Seed additional scenarios into different states so the queue has data
_seeded_extra = False


def _seed_approvals():
    global _seeded_extra
    if _seeded_extra:
        return
    _seeded_extra = True
    # Give existing scenarios statuses that make the queue interesting
    now = _now()
    for sid, scs in SCENARIOS.items():
        if not scs:
            continue
        # Set first scenario to submitted / sent_for_approval
        for i, sc in enumerate(scs):
            sc.setdefault("academic_year", "2026-2027")
            sc.setdefault("submitted_at", now)
            sc.setdefault("kpis", {
                "y1": {"net_ciro": 50_000_000 + i * 1_000_000, "net_result": 8_000_000 + i * 200_000, "students_total": 620 - i * 20},
                "y2": {"net_ciro": 55_000_000 + i * 1_100_000, "net_result": 9_500_000 + i * 220_000, "students_total": 660 - i * 20},
                "y3": {"net_ciro": 60_000_000 + i * 1_200_000, "net_result": 11_000_000 + i * 240_000, "students_total": 700 - i * 20},
            })
            sc.setdefault("progress_pct", 82 - i * 5)
        # First scenario → sent_for_approval so it's approvable
        scs[0]["status"] = "sent_for_approval"
        if len(scs) > 1:
            scs[1]["status"] = "submitted"


BATCHES: List[Dict[str, Any]] = []


def _seed_batches():
    if BATCHES:
        return
    now = _now()
    BATCHES.append({
        "batch_id": 1,
        "status": "submitted",
        "academic_year": "2026-2027",
        "created_at": now,
        "reviewed_at": None,
        "review_note": None,
        "country": {"id": 1, "name": "Türkiye", "region": "EMEA"},
        "items": [
            {"scenario_id": "sc1a", "school_id": "s1", "is_source": True},
            {"scenario_id": "sc2a", "school_id": "s2", "is_source": False},
        ],
    })
    BATCHES.append({
        "batch_id": 2,
        "status": "approved",
        "academic_year": "2025-2026",
        "created_at": now,
        "reviewed_at": now,
        "review_note": "Onaylandı, tüm yıllar dahil.",
        "country": {"id": 1, "name": "Türkiye", "region": "EMEA"},
        "items": [
            {"scenario_id": "sc1b", "school_id": "s1", "is_source": True},
        ],
    })


def _scenario_row(scenario: Dict[str, Any]) -> Dict[str, Any]:
    school = next((s for s in SCHOOLS if str(s["id"]) == str(scenario["school_id"])), None)
    country = None
    if school:
        country = next((c for c in COUNTRIES if c["id"] == school.get("country_id")), None)
    kpis = scenario.get("kpis") or {"y1": None, "y2": None, "y3": None}
    return {
        "scenario": {
            "id": scenario["id"],
            "name": scenario["name"],
            "academic_year": scenario.get("academic_year", "2026-2027"),
            "status": scenario.get("status", "draft"),
            "submitted_at": scenario.get("submitted_at"),
            "review_note": scenario.get("review_note"),
            "reviewed_at": scenario.get("reviewed_at"),
            "input_currency": scenario.get("input_currency"),
            "local_currency_code": scenario.get("local_currency_code"),
            "fx_usd_to_local": scenario.get("fx_usd_to_local"),
            "progress_pct": scenario.get("progress_pct"),
            "progress_missing_preview": None,
            "progress_missing_count": 0,
            "sent_at": scenario.get("sent_at"),
            "checked_at": scenario.get("checked_at"),
        },
        "school": {"id": school["id"], "name": school["name"]} if school else {"id": "", "name": "?"},
        "country": (
            {"id": country["id"], "name": country["name"], "region": country.get("region")}
            if country
            else {"id": 0, "name": "?", "region": None}
        ),
        "kpis": kpis,
        "missingKpis": {"y1": kpis.get("y1") is None, "y2": kpis.get("y2") is None, "y3": kpis.get("y3") is None},
    }


@api.get("/admin/scenarios/queue")
async def admin_scenarios_queue(
    status: Optional[str] = None,
    academicYear: Optional[str] = None,
    region: Optional[str] = None,
    countryId: Optional[int] = None,
    user=Depends(get_current_user),
):
    _require_admin(user)
    _seed_approvals()
    rows = []
    for scs in SCENARIOS.values():
        for sc in scs:
            row = _scenario_row(sc)
            if status and row["scenario"]["status"] != status:
                continue
            if academicYear and row["scenario"]["academic_year"] != academicYear:
                continue
            if region and (row["country"].get("region") != region):
                continue
            if countryId is not None and row["country"]["id"] != countryId:
                continue
            rows.append(row)
    return rows


class ReviewBody(BaseModel):
    action: str
    note: Optional[str] = None
    includedYears: Optional[List[str]] = None
    revisionWorkIds: Optional[List[str]] = None


VALID_YEARS = ["y1", "y2", "y3"]
VALID_WORK_IDS = ["temelBilgiler", "kapasite", "ik", "gelirler", "giderler"]


@api.patch("/admin/scenarios/{scenario_id}/review")
async def admin_review_scenario(scenario_id: str, body: ReviewBody, user=Depends(get_current_user)):
    _require_admin(user)
    scenario = None
    for scs in SCENARIOS.values():
        for sc in scs:
            if str(sc["id"]) == str(scenario_id):
                scenario = sc
                break
        if scenario:
            break
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if body.action not in ("approve", "revise"):
        raise HTTPException(status_code=400, detail="Invalid action")
    if body.action == "approve":
        if scenario.get("status") != "sent_for_approval":
            raise HTTPException(
                status_code=409,
                detail="Scenario must be sent for approval before admin approval",
            )
        years = body.includedYears or list(VALID_YEARS)
        for y in years:
            if y not in VALID_YEARS:
                raise HTTPException(status_code=400, detail=f"Invalid year: {y}")
        scenario["status"] = "approved"
        scenario["reviewed_at"] = _now()
        scenario["review_note"] = body.note
        scenario["included_years"] = years
    else:
        if scenario.get("status") not in ("sent_for_approval", "approved", "submitted"):
            raise HTTPException(
                status_code=409,
                detail="Scenario must be sent for approval or approved to request revision",
            )
        if not (body.note and body.note.strip()):
            raise HTTPException(status_code=400, detail="note is required for revision requests")
        if not body.revisionWorkIds:
            raise HTTPException(status_code=400, detail="revisionWorkIds must be a non-empty array")
        for wid in body.revisionWorkIds:
            if wid not in VALID_WORK_IDS:
                raise HTTPException(status_code=400, detail=f"Invalid work id: {wid}")
        scenario["status"] = "revision_requested"
        scenario["review_note"] = body.note
        scenario["reviewed_at"] = _now()
        scenario["revision_work_ids"] = body.revisionWorkIds
    return {"ok": True}


@api.get("/admin/approval-batches/queue")
async def admin_batch_queue(
    status: Optional[str] = None,
    academicYear: Optional[str] = None,
    region: Optional[str] = None,
    countryId: Optional[int] = None,
    user=Depends(get_current_user),
):
    _require_admin(user)
    _seed_batches()
    rows = []
    for b in BATCHES:
        if status and b["status"] != status:
            continue
        if academicYear and b["academic_year"] != academicYear:
            continue
        if region and b["country"].get("region") != region:
            continue
        if countryId is not None and b["country"]["id"] != countryId:
            continue
        rows.append({
            "batch_id": b["batch_id"],
            "status": b["status"],
            "academic_year": b["academic_year"],
            "created_at": b["created_at"],
            "reviewed_at": b.get("reviewed_at"),
            "review_note": b.get("review_note"),
            "country": b["country"],
            "scenario_count": len(b.get("items", [])),
            "school_count": len({i["school_id"] for i in b.get("items", [])}),
        })
    return rows


def _find_batch(batch_id: str):
    for b in BATCHES:
        if str(b["batch_id"]) == str(batch_id):
            return b
    return None


@api.get("/admin/approval-batches/{batch_id}")
async def admin_batch_detail(batch_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    _seed_batches()
    b = _find_batch(batch_id)
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    items = []
    for it in b.get("items", []):
        scenario = None
        for scs in SCENARIOS.values():
            for sc in scs:
                if str(sc["id"]) == str(it["scenario_id"]):
                    scenario = sc
                    break
            if scenario:
                break
        school = next(
            (s for s in SCHOOLS if str(s["id"]) == str(it["school_id"])), None,
        )
        items.append({
            "scenario_id": it["scenario_id"],
            "scenario_name": scenario["name"] if scenario else "?",
            "school_id": it["school_id"],
            "school_name": school["name"] if school else "?",
            "status": scenario["status"] if scenario else "?",
            "sent_at": scenario.get("sent_at") if scenario else None,
            "progress_pct": scenario.get("progress_pct") if scenario else None,
            "is_source": it.get("is_source", False),
        })
    return {
        "batch": {
            "id": b["batch_id"],
            "status": b["status"],
            "academic_year": b["academic_year"],
            "created_at": b["created_at"],
            "reviewed_at": b.get("reviewed_at"),
            "review_note": b.get("review_note"),
            "country": b["country"],
        },
        "items": items,
    }


@api.patch("/admin/approval-batches/{batch_id}/review")
async def admin_review_batch(batch_id: str, body: ReviewBody, user=Depends(get_current_user)):
    _require_admin(user)
    b = _find_batch(batch_id)
    if not b:
        raise HTTPException(status_code=404, detail="Batch not found")
    if body.action not in ("approve", "revise"):
        raise HTTPException(status_code=400, detail="Invalid action")
    if body.action == "approve":
        years = body.includedYears or list(VALID_YEARS)
        for y in years:
            if y not in VALID_YEARS:
                raise HTTPException(status_code=400, detail=f"Invalid year: {y}")
        b["status"] = "approved"
        b["reviewed_at"] = _now()
        b["review_note"] = body.note
    else:
        if not (body.note and body.note.strip()):
            raise HTTPException(status_code=400, detail="note is required for revision requests")
        if not body.revisionWorkIds:
            raise HTTPException(status_code=400, detail="revisionWorkIds must be a non-empty array")
        for wid in body.revisionWorkIds:
            if wid not in VALID_WORK_IDS:
                raise HTTPException(status_code=400, detail=f"Invalid work id: {wid}")
        b["status"] = "revision_requested"
        b["reviewed_at"] = _now()
        b["review_note"] = body.note
    return {"ok": True}


@api.get("/schools/{school_id}/scenarios/{scenario_id}/report")
async def get_report(school_id: str, scenario_id: str, mode: str = "original", user=Depends(get_current_user)):
    inputs = _get_inputs(scenario_id)
    return _compute_report(inputs)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
