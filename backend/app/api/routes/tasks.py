from fastapi import APIRouter
from pydantic import BaseModel
from app.orchestrator.orchestrator import run_task

router = APIRouter(prefix="/tasks", tags=["tasks"])

class TaskRequest(BaseModel):
    input_text: str

@router.post("")
def create_task(payload: TaskRequest):
    return run_task(payload.input_text)
