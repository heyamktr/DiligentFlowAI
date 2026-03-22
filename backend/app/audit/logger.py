from datetime import datetime

def log_event(actor: str, message: str):
    print(f"[{datetime.utcnow()}] [{actor}] {message}")
