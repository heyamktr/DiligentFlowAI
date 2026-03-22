from fastapi import FastAPI
from app.api.routes.tasks import router as tasks_router

app = FastAPI(title="Authorized-to-Act Orchestrator")

app.include_router(tasks_router)

@app.get("/")
def root():
    return {"message": "Backend is running"}
