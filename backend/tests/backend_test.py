"""Feasibility Studio demo backend tests - MVP flows."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") + "/api"
DEMO_EMAIL = "demo@feasibility.io"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Health ----
def test_root_ok():
    r = requests.get(f"{BASE_URL}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---- Auth ----
def test_login_success():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "token" in data and data["token"]
    assert data["user"]["email"] == DEMO_EMAIL
    assert "password" not in data["user"]


def test_login_wrong_password_401_turkish():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": DEMO_EMAIL, "password": "wrongpass"}, timeout=10)
    assert r.status_code == 401
    detail = r.json().get("detail", "")
    assert "Geçersiz" in detail or "parola" in detail.lower()


def test_me_with_bearer(auth_headers):
    r = requests.get(f"{BASE_URL}/auth/me", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["email"] == DEMO_EMAIL


def test_protected_endpoint_without_token_401():
    r = requests.get(f"{BASE_URL}/schools", timeout=10)
    assert r.status_code == 401


def test_protected_endpoint_invalid_token_401():
    r = requests.get(f"{BASE_URL}/schools",
                     headers={"Authorization": "Bearer invalid.token.here"}, timeout=10)
    assert r.status_code == 401


# ---- Schools ----
def test_list_schools(auth_headers):
    r = requests.get(f"{BASE_URL}/schools", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 3
    cities = {s["city"] for s in data["items"]}
    assert cities == {"İstanbul", "Ankara", "İzmir"}


def test_get_school_by_id(auth_headers):
    r = requests.get(f"{BASE_URL}/schools/s1", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["id"] == "s1"


# ---- Scenarios ----
def test_list_scenarios_s1(auth_headers):
    r = requests.get(f"{BASE_URL}/schools/s1/scenarios", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    ids = {s["id"] for s in data["items"]}
    assert ids == {"sc1a", "sc1b"}


# ---- Inputs ----
def test_get_default_inputs(auth_headers):
    r = requests.get(f"{BASE_URL}/schools/s1/scenarios/sc1a/inputs",
                     headers=auth_headers, timeout=10)
    assert r.status_code == 200
    inputs = r.json()["inputs"]
    for key in ["temelBilgiler", "kapasite", "ik", "gelirler", "giderler"]:
        assert key in inputs, f"missing section {key}"


def test_put_inputs_persists(auth_headers):
    # Get, modify, put, verify
    get1 = requests.get(f"{BASE_URL}/schools/s1/scenarios/sc1a/inputs",
                        headers=auth_headers, timeout=10)
    inputs = get1.json()["inputs"]
    inputs["kapasite"]["toplamKapasite"] = 999
    inputs["kapasite"]["hedefDoluluk"] = 80

    put = requests.put(f"{BASE_URL}/schools/s1/scenarios/sc1a/inputs",
                       headers=auth_headers, json={"inputs": inputs}, timeout=10)
    assert put.status_code == 200
    assert put.json()["ok"] is True

    get2 = requests.get(f"{BASE_URL}/schools/s1/scenarios/sc1a/inputs",
                       headers=auth_headers, timeout=10)
    assert get2.json()["inputs"]["kapasite"]["toplamKapasite"] == 999


# ---- Report ----
def test_report_kpis_computed(auth_headers):
    # ensure known inputs
    inputs = {
        "temelBilgiler": {"kur": "TRY"},
        "kapasite": {"toplamKapasite": 1000, "hedefDoluluk": 50},
        "gelirler": {"yillikUcret": 100000, "kayitUcreti": 10000,
                     "indirimOrani": 0, "ekGelirler": 0},
        "giderler": {"personel": 10000000, "kira": 0, "islektme": 0,
                     "yatirim": 0, "digerGiderler": 0},
    }
    put = requests.put(f"{BASE_URL}/schools/s1/scenarios/sc1a/inputs",
                       headers=auth_headers, json={"inputs": inputs}, timeout=10)
    assert put.status_code == 200

    r = requests.get(f"{BASE_URL}/schools/s1/scenarios/sc1a/report",
                     headers=auth_headers, timeout=10)
    assert r.status_code == 200
    body = r.json()
    kpis = body["kpis"]
    # 1000 * 0.5 = 500 active students
    assert kpis["aktifOgrenci"] == 500
    # revenue: 500*100000 + 500*10000 = 55_000_000
    assert kpis["toplamGelir"] == pytest.approx(55_000_000)
    assert kpis["toplamGider"] == pytest.approx(10_000_000)
    assert kpis["faaliyetKari"] == pytest.approx(45_000_000)
    assert kpis["karMarji"] == pytest.approx(45_000_000 / 55_000_000 * 100)
    assert body["currency"] == "TRY"
