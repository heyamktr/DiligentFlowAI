def execute_email_task(input_text: str, token: dict):
    return {
        "message": "Email sent",
        "input": input_text,
        "scopes": token["scopes"]
    }
