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
