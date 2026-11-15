"""What the demo's one peer review case holds: the evidence, the interview and the AI's report of
an applicant who finished their interview, in the shapes the verification worker writes them
(app/workers/verification.py) and the reviewer's screen reads them (apps/web/app/reviews).

The review screen is anonymous, so no name appears below. A GitHub owner name never holds an
underscore, so these addresses can never be a stranger's repositories.
"""

REPOSITORIES = [
    "https://github.com/tm_codes/payments-api",
    "https://github.com/tm_codes/job-queue",
    "https://github.com/tm_codes/receipts-service",
]

MODEL = "gemini-2.5-flash"

WELCOME = (
    "Welcome. I read your three repositories before this interview. I will ask four questions "
    "about them. Answer in your own words and take the time you need."
)

# as (question, answer, what the interviewer said before the next question)
TURNS = [
    (
        "Your payments API takes a request and writes a payment. Walk me through what happens "
        "between the HTTP call and the committed row, and where a failure can leave things "
        "half done.",
        "The route checks the token and the body, then calls a service function. The service "
        "opens one database transaction, inserts the payment with the idempotency key from the "
        "header and commits. If the key already exists, the unique index rejects the insert, I "
        "catch that and return the stored payment, so a retry gets the same answer. What can go "
        "wrong is the call to the mobile money provider. I do not make it inside the "
        "transaction. I write the payment as pending, commit, and let the queue worker call the "
        "provider.",
        "Good. Keeping the provider call outside the transaction avoids holding a lock while a "
        "slow network answers.",
    ),
    (
        "In the job queue repository, how do you make sure a job that fails halfway does not "
        "repeat its side effect?",
        "Each job row has a status and an attempt count. The worker claims a job with SELECT "
        "FOR UPDATE SKIP LOCKED, so two workers never take the same one. The side effect, "
        "sending a receipt, is guarded by a receipts table with a unique key on the job id. If "
        "the worker dies after sending but before marking the job done, the retry tries to "
        "insert the same receipt, hits the unique key and skips the send. It is not perfect, "
        "because the send and the insert are two steps, but the worst case is one repeated "
        "message, never a repeated payment.",
        "That is an honest account of the gap. A unique key on the job is the right guard.",
    ),
    (
        "Which part of your code do you trust least, and what would you check first?",
        "The retry timing in the worker. I use a fixed delay of thirty seconds, and I never "
        "tried what happens when the provider is down for an hour. I would add a test with a "
        "provider that always fails, then make the delay grow with each attempt and stop after "
        "a limit, with a final state for stuck jobs that someone can look at.",
        "Growing the delay and adding a final state for stuck jobs is the usual fix.",
    ),
    (
        "You need to add a NOT NULL column to a table with ten million rows while the service "
        "stays up. How do you ship it?",
        "Three releases. First I add the column as nullable with no default, which is quick. "
        "Then I deploy code that writes the new value and backfill the old rows in batches of a "
        "few thousand, pausing between batches so the database keeps up. When no null is left, "
        "I add the NOT NULL rule as NOT VALID, validate it, and then set it. Each step can be "
        "rolled back on its own.",
        "Clear and safe. Validating the rule separately avoids a long lock.",
    ),
]

CLOSING = (
    "Thank you, that was the last question. A reviewer will read your answers and this "
    "report, then decide."
)

CODEBASE_ANALYSIS = {
    "score": 79,
    "summary": (
        "Three services that share one PostgreSQL schema and run in Docker. The code is split "
        "into routes, services and models, and the queue worker reuses the models of the API. "
        "Tests cover the payment rules but not the retry timing of the worker."
    ),
    "strengths": [
        "Routes stay thin and the rules live in service functions.",
        "Every payment carries an idempotency key with a unique index.",
        "The schema changes in small migrations, one per change.",
    ],
    "concerns": [
        "The retry delay of the worker is fixed and has no limit on attempts.",
        "No test runs the worker against a provider that keeps failing.",
    ],
    "evidence": [
        {
            "criterion": "structure",
            "reference": "payments-api/app/services/payments.py holds the payment rules.",
        },
        {
            "criterion": "test_coverage",
            "reference": "job-queue/tests has no case for a provider that stays down.",
        },
        {
            "criterion": "role_relevance",
            "reference": "job-queue/worker/claim.py takes jobs with row locks.",
        },
        {
            "criterion": "engineering_practice",
            "reference": ".github/workflows/ci.yml runs the tests on every push.",
        },
    ],
    "model": MODEL,
    "criterion_assessments": [
        {
            "criterion": "structure",
            "score": 21,
            "rationale": (
                "The API keeps routes, services and models apart, and the worker imports the "
                "same models, so a payment means one thing in both."
            ),
            "evidence": [
                "payments-api/app/routes/payments.py",
                "payments-api/app/services/payments.py",
                "job-queue/worker/models.py",
            ],
        },
        {
            "criterion": "test_coverage",
            "score": 17,
            "rationale": (
                "The payment rules, the idempotency key and the receipt guard have tests. The "
                "retry timing of the worker has none."
            ),
            "evidence": [
                "payments-api/tests/test_payments.py",
                "receipts-service/tests/test_receipts.py",
            ],
        },
        {
            "criterion": "role_relevance",
            "score": 22,
            "rationale": (
                "This is backend work: one transaction around each write, a unique index for "
                "repeated requests and a queue that two workers can read safely."
            ),
            "evidence": [
                "payments-api/migrations/0003_idempotency_key.sql",
                "job-queue/worker/claim.py",
            ],
        },
        {
            "criterion": "engineering_practice",
            "score": 19,
            "rationale": (
                "Small commits with clear messages, one migration per change and a CI file "
                "that runs the tests. Configuration comes from the environment."
            ),
            "evidence": [".github/workflows/ci.yml", "payments-api/Dockerfile"],
        },
    ],
    "security_flags": [],
    "confidence": 0.8,
}

FINAL_REPORT = {
    "score": 78,
    "summary": (
        "The applicant shows solid backend habits. Repeated requests are handled with an "
        "idempotency key, work that can fail stays outside the database transaction and schema "
        "changes are planned in safe steps. The interview answers match what the code does. "
        "The main gap is the retry timing of the worker, which the applicant named without "
        "being asked."
    ),
    "codebase_findings": [
        "Each payment write runs in one transaction and carries an idempotency key with a "
        "unique index.",
        "The queue worker takes jobs with row locks, so two workers never hold the same job.",
        "Tests cover the payment rules and the receipt guard, not the retry timing.",
    ],
    "interview_findings": [
        "Explained where a payment can be left half done and why the provider call sits outside "
        "the transaction.",
        "Described the risk of a repeated message in the receipt step without being asked.",
        "Gave a three-step plan for adding a required column to a large table, each step "
        "reversible.",
    ],
    "concerns": [
        "The retry delay is fixed and no test covers a provider that stays down.",
        "Two of the three repositories have few commits, so their history gives little to "
        "compare with the interview.",
    ],
    "security_flags": [],
    "confidence": 0.82,
    "model": MODEL,
}
