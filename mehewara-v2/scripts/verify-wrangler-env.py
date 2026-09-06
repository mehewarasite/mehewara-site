#!/usr/bin/env python3
"""Validate the effective Wrangler configuration for one deployment environment.

Usage: verify-wrangler-env.py <wrangler.toml> <staging|production>
       verify-wrangler-env.py --self-test

Validation is deliberately stricter than Wrangler's own resolution: every
required value must be present IN the selected [env.<name>] section itself —
top-level defaults are never consulted. Depending on inheritance would let a
“resolved” deployment silently change meaning when someone edits an
unrelated default, and it would let comments or sibling environments leak
into the decision. Placeholders in *other* environments, and comments
mentioning placeholder patterns anywhere in the file, can therefore never
block or pass an unrelated deployment. Every required value must also be
non-empty and free of placeholder/example markers; anything less fails the
deployment before it starts. Unprovisioned environments fail closed here.
"""
import sys
import tomllib

PLACEHOLDER_MARKERS = ("REPLACE_", "replace-with-", "example-id", "example-com", "example-in")

EXPECTED = {
    "staging": {"name": "mehewara-v2-api-staging", "environment": "staging"},
    "production": {"name": "mehewara-v2-api-production", "environment": "production"},
}

REQUIRED_VARS = ("ENVIRONMENT", "ADMIN_SECRET", "SUPER_ADMIN_SECRET", "ALLOWED_ORIGINS",
                 "B2_ENDPOINT", "B2_REGION", "B2_BUCKET")


def is_placeholder(value: object) -> bool:
    return (
        not isinstance(value, str)
        or not value.strip()
        or any(marker in value for marker in PLACEHOLDER_MARKERS)
    )


def validate(config: dict, env: str) -> list[str]:
    problems: list[str] = []
    section = config.get("env", {}).get(env)
    if not isinstance(section, dict):
        return [f"[env.{env}] section is missing"]
    expected = EXPECTED[env]

    if section.get("name") != expected["name"]:
        problems.append(f"env {env} worker name must be {expected['name']!r} (set it in [env.{env}], not top level)")

    env_vars = section.get("vars", {})
    if not isinstance(env_vars, dict):
        problems.append(f"[env.{env}] vars table is missing")
        env_vars = {}
    for name in REQUIRED_VARS:
        if is_placeholder(env_vars.get(name)):
            problems.append(f"vars.{name} is missing or still a placeholder in [env.{env}]")
    if env_vars.get("ENVIRONMENT") != expected["environment"]:
        problems.append(f"vars.ENVIRONMENT in [env.{env}] must be {expected['environment']!r}")

    dbs = section.get("d1_databases", [])
    d1 = next((db for db in dbs if isinstance(db, dict) and db.get("binding") == "D1"), None)
    if d1 is None:
        problems.append(f"no d1_databases binding D1 in [env.{env}]")
    elif is_placeholder(d1.get("database_id")):
        problems.append(f"d1 database_id is missing or still a placeholder in [env.{env}]")

    bindings = section.get("durable_objects", {}).get("bindings", [])
    budget = next((b for b in bindings if isinstance(b, dict) and b.get("name") == "BUDGET_AUTHORITY"), None)
    if budget is None:
        problems.append(f"BUDGET_AUTHORITY durable-object binding missing in [env.{env}]")
    elif budget.get("class_name") != "BudgetAuthority":
        problems.append(f"BUDGET_AUTHORITY class_name in [env.{env}] must be 'BudgetAuthority'")

    return problems


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    if len(sys.argv) != 3 or sys.argv[2] not in ("staging", "production"):
        print("usage: verify-wrangler-env.py <wrangler.toml> <staging|production>", file=sys.stderr)
        return 2
    path, env = sys.argv[1], sys.argv[2]
    with open(path, "rb") as handle:
        config = tomllib.load(handle)
    problems = validate(config, env)
    if problems:
        for problem in problems:
            print(f"wrangler env check failed: {problem}", file=sys.stderr)
        return 1
    print(f"wrangler env check passed for env {env}.")
    return 0


def self_test() -> int:
    """Fixture-based regression tests for the validator itself."""
    base_vars = {
        "ENVIRONMENT": "staging",
        "ADMIN_SECRET": "test-admin-secret",
        "SUPER_ADMIN_SECRET": "test-super-secret",
        "ALLOWED_ORIGINS": "https://preview.mehewara.test",
        "B2_ENDPOINT": "https://s3.us-west-002.backblazeb2.com",
        "B2_REGION": "us-west-002",
        "B2_BUCKET": "mehewara-v2-staging-media",
    }
    base_d1 = [{"binding": "D1", "database_name": "mehewara-v2-staging",
                "database_id": "11111111-2222-3333-4444-555555555555"}]
    base_do = {"bindings": [{"name": "BUDGET_AUTHORITY", "class_name": "BudgetAuthority"}]}

    def fixture(**overrides: object) -> dict:
        section: dict = {"name": "mehewara-v2-api-staging", "vars": dict(base_vars),
                         "d1_databases": [dict(base_d1[0])],
                         "durable_objects": {"bindings": [dict(base_do["bindings"][0])]}}
        section.update(overrides)
        # Top level is intentionally hostile: placeholders, wrong names, and
        # comments' worth of markers must never influence the verdict.
        return {"name": "WRONG-TOP-LEVEL", "vars": {"ENVIRONMENT": "REPLACE_ME"},
                "env": {"staging": section, "production": {}}}

    cases = [
        ("happy staging passes", fixture(), []),
        ("missing env-local var fails even with clean top level",
         fixture(vars={k: v for k, v in base_vars.items() if k != "B2_BUCKET"}),
         ["vars.B2_BUCKET"]),
        ("wrong ENVIRONMENT fails",
         fixture(vars={**base_vars, "ENVIRONMENT": "production"}),
         ["vars.ENVIRONMENT"]),
        ("incomplete DO bindings fail",
         fixture(durable_objects={"bindings": [{"name": "BUDGET_AUTHORITY"}]}),
         ["class_name"]),
        ("placeholder database_id fails",
         fixture(d1_databases=[{**base_d1[0], "database_id": "REPLACE_WITH_X"}]),
         ["database_id"]),
        ("production section independent of staging",
         {"env": {"staging": fixture()["env"]["staging"], "production": {}}},
         ["production"]),
    ]
    failures = 0
    for label, config, expected_fragments in cases:
        env = "production" if label.startswith("production section") else "staging"
        problems = validate(config, env)
        if expected_fragments:
            ok = problems and all(any(frag in p for p in problems) for frag in expected_fragments)
        else:
            ok = not problems
        print(f"{'PASS' if ok else 'FAIL'}: {label}" + ("" if ok else f" -> {problems}"))
        failures += 0 if ok else 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
