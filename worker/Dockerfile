FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# UTEONT_API_BASE, WORKER_SHARED_SECRET, and optional WORKER_ID /
# REDDIT_* are set in the deploy environment, not baked into the image.
ENV PYTHONUNBUFFERED=1 \
    LOG_LEVEL=INFO \
    POLL_INTERVAL=5

CMD ["python", "worker.py"]
