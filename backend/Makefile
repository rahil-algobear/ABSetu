.PHONY: help install install-dev test test-coverage lint format type-check run run-local run-local-port migrate upgrade downgrade kill-server clean

# Use venv python if available, otherwise fall back to python3
PYTHON := $(shell if [ -f venv/bin/python ]; then echo venv/bin/python; else echo python3; fi)
PORT ?= 8100

help:
	@echo "Available commands:"
	@echo "  make install              - Install production dependencies"
	@echo "  make install-dev          - Install development dependencies"
	@echo "  make test                 - Run tests"
	@echo "  make test-coverage        - Run tests with coverage report"
	@echo "  make lint                 - Run linters"
	@echo "  make format               - Format code with black and isort"
	@echo "  make type-check           - Run type checking with mypy"
	@echo "  make run                  - Run the application"
	@echo "  make run-local            - Run application in local mode with reload (default PORT=8100)"
	@echo "  make run-local-port       - Run application on custom port (use PORT=8001)"
	@echo "  make migrate              - Create a new migration (use msg='Description')"
	@echo "  make upgrade              - Apply database migrations"
	@echo "  make downgrade            - Rollback last migration"
	@echo "  make kill-server          - Kill server running on port 8000"
	@echo "  make clean                - Clean up cache and temporary files"

install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt
	pre-commit install

test:
	pytest

test-coverage:
	pytest --cov=app --cov-report=html

lint:
	flake8 app tests
	black --check app tests
	isort --check-only app tests

format:
	black app tests
	isort app tests

type-check:
	mypy app --ignore-missing-imports

run:
	@echo "Running FastAPI application..."
	@echo "Set APP_ENV=local or APP_ENV=production, or use: make run-local"
	$(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT)

run-local:
	APP_ENV=local $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

run-local-port:
	@if [ -z "$(PORT)" ]; then \
		echo "Error: PORT required. Usage: make run-local-port PORT=8001"; \
		exit 1; \
	fi
	APP_ENV=local $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

migrate:
	@if [ -z "$(msg)" ]; then \
		echo "Error: Migration message required. Usage: make migrate msg='Description'"; \
		exit 1; \
	fi
	alembic revision --autogenerate -m "$(msg)"

upgrade:
	alembic upgrade head

downgrade:
	alembic downgrade -1

seed:
	$(PYTHON) -m app.seeds.initial

seed-org:
	@if [ -z "$(file)" ]; then \
		echo "Error: Seed file required. Usage: make seed-org file=kshamata"; \
		exit 1; \
	fi
	$(PYTHON) -m app.seeds.$(file)

kill-server:
	@echo "Killing server on port $(PORT)..."
	@if lsof -ti:$(PORT) > /dev/null 2>&1; then \
		lsof -ti:$(PORT) | xargs kill -9; \
		echo "Killed process(es) on port $(PORT)"; \
	else \
		echo "No process found on port $(PORT)"; \
	fi

clean:
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -r {} +
	rm -rf .pytest_cache
	rm -rf .mypy_cache
	rm -rf htmlcov
	rm -rf .coverage
