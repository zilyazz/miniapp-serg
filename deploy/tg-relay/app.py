from flask import Flask, request, jsonify
import os
import requests

app = Flask(__name__)

BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
RELAY_SECRET = os.environ["RELAY_SECRET"]
FORWARD_WEBHOOK_URL = os.environ["FORWARD_WEBHOOK_URL"]
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
FORWARD_TIMEOUT = int(os.environ.get("FORWARD_TIMEOUT_SEC", "15"))
TELEGRAM_TIMEOUT = int(os.environ.get("TELEGRAM_TIMEOUT_SEC", "30"))

TELEGRAM_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

session = requests.Session()


def check_secret(req):
    return req.headers.get("X-Relay-Secret", "") == RELAY_SECRET


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.post("/telegram/create-invoice-link")
def create_invoice_link():
    if not check_secret(request):
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    payload = request.get_json(force=True, silent=False)

    response = session.post(
        f"{TELEGRAM_BASE}/createInvoiceLink",
        json=payload,
        timeout=TELEGRAM_TIMEOUT,
    )

    return (response.text, response.status_code, {"Content-Type": "application/json"})


@app.post("/telegram/answer-precheckout")
def answer_precheckout():
    if not check_secret(request):
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    payload = request.get_json(force=True, silent=False)

    response = session.post(
        f"{TELEGRAM_BASE}/answerPreCheckoutQuery",
        json=payload,
        timeout=TELEGRAM_TIMEOUT,
    )

    return (response.text, response.status_code, {"Content-Type": "application/json"})


@app.post("/telegram/webhook")
def telegram_webhook():
    if TELEGRAM_WEBHOOK_SECRET:
        incoming_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "").strip()
        if incoming_secret != TELEGRAM_WEBHOOK_SECRET:
            return jsonify({"ok": False, "error": "invalid_telegram_webhook_secret"}), 401

    raw_body = request.get_data(cache=False)
    headers = {"Content-Type": "application/json"}

    telegram_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if telegram_secret:
        headers["X-Telegram-Bot-Api-Secret-Token"] = telegram_secret

    response = session.post(
        FORWARD_WEBHOOK_URL,
        data=raw_body,
        headers=headers,
        timeout=FORWARD_TIMEOUT,
    )

    return (
        response.text,
        response.status_code,
        {"Content-Type": response.headers.get("Content-Type", "application/json")},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8085)
