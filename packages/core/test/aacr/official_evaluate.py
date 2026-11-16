"""Runs AACR-Bench's own evaluate() offline over a Komodo run directory.

Used by differential.test.ts. The judge model is replaced by a fake client
that answers from canned text keyed by the generated comment, so the real
prompt construction, answer parsing, file-level matching, greedy dedup,
statistics and rounding all run unchanged. Every prompt the evaluator built
is returned so the TS port can be checked character for character.

usage: python official_evaluate.py <aacr-bench/evaluation> <run-dir> <answers.json>
"""
import asyncio
import contextlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

evaluation_dir, run_dir, answers_path = sys.argv[1:4]
# A key makes judge.py choose its LLM path (not the mock); the client is faked below.
os.environ["JUDGE_API_KEY"] = "offline"
os.environ.pop("JUDGE_USE_MOCK", None)
sys.path.insert(0, evaluation_dir)

import judge  # noqa: E402

answers = json.loads(Path(answers_path).read_text(encoding="utf-8"))
prompts = []
GEN = re.compile(r"-Generated Comment-\n\[L[^\]]*\] (.*?)\n\n-Reference Comments-", re.S)


class FakeCompletions:
    async def create(self, model, messages, **kwargs):
        prompt = messages[0]["content"]
        prompts.append(prompt)
        note = GEN.search(prompt).group(1)
        text = answers[note]
        if text is None:
            raise RuntimeError("judge unavailable")
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text))])


judge._llm_client = SimpleNamespace(chat=SimpleNamespace(completions=FakeCompletions()))

import evaluate  # noqa: E402
import schema  # noqa: E402

official = Path(run_dir) / "official"
instances = schema.load_instances(official / "dataset.jsonl")
# evaluate() prints progress to stdout; keep stdout for the JSON alone.
with tempfile.TemporaryDirectory() as out, contextlib.redirect_stdout(sys.stderr):
    result = asyncio.run(evaluate.evaluate(instances, official, "komodo", Path(out)))

json.dump(
    {"summary": result["summary"], "eval_res": result["eval_res"], "prompts": sorted(prompts)},
    sys.stdout,
    ensure_ascii=False,
)
