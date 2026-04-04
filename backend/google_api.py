
import os.path
import datetime as dt

from simplegmail import Gmail
from simplegmail.query import construct_query

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# ---------- Setup for the API usage permissions and authentication ----------
def get_access_creds(service: str):
    scopes = {
        "calendar": ["https://www.googleapis.com/auth/calendar"],
        "gmail": ["https://www.googleapis.com/auth/gmail"]
    }

    token_file = f"{service}_token.json"
    creds = None

    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "client_secret.json",
                scopes=scopes[service]
            )
            creds = flow.run_local_server(port=0)

        with open(token_file, "w") as token:
            token.write(creds.to_json())

    return creds

# ---------- Setup for the gmail API ----------
gmail = Gmail()

def print_labels_n_categories():
    print("Available labels and categories in your gmail:")
    
    labels = gmail.list_labels()
    for label in labels:
        print(label.name)

def access_gmail(**query_params):
    """
    ----- EXAMPLE ----
            query_params = {
                "newer_than": (7, "day"),
                "labels": "Inbox",
                "category": "primary",
            }
    """
    # Criteria for email retrieval
    # time_period can be either day, month, or year
    q_params = {
        "newer_than": (query_params["newer_than"], query_params["time_period"]),
        "labels": query_params["labels"],
        "category": query_params["category"],
    }

    emails = gmail.get_messages(query=construct_query(q_params))

    # Convert to structured data
    email_list = []
    for email in emails:
        email_list.append({
            "to": email.recipient,
            "from": email.sender,
            "subject": email.subject,
            "date": email.date,
            "email_body": email.plain,
        })

    return email_list

# ---------- Setup for the google calendar API ----------
def access_calendar():
    creds = get_access_creds("calendar")

    try:
        service = build("calendar", "v3", credentials=creds)
        
        now = dt.datetime.now().isoformat() + "Z"
        event_result = service.events().list(
                calendarId="primary",
                timeMin=now,
                maxResults=10,
                singleEvents=True,
                orderBy="startTime"
            ).execute()
        events = event_result.get("items", [])

        if not events:
            return "No upcoming events found"
        
        return [
            {
                "start": event["start"].get("dateTime", event["start"].get("date")),
                "summary": event["summary"]
            }
            for event in events
        ]

    except HttpError as error:
        return f"An error occured: {error}"

# print(access_calendar())
# print("----------------")
# print(access_gmail(
#                 newer_than=7,
#                 time_period="day",
#                 labels="Inbox",
#                 category="primary"
#             )
# )

# print_labels_n_categories()