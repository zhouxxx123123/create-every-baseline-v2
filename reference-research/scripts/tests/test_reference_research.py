from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS_DIR))

from reference_research_core import create_citation, prepare_request, validate_report


def run_git(root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    return completed.stdout.strip()


def init_repo(root: Path, remote: str | None = None) -> str:
    root.mkdir(parents=True, exist_ok=True)
    run_git(root, "init")
    run_git(root, "config", "user.email", "reference-research@example.test")
    run_git(root, "config", "user.name", "Reference Research Test")
    (root / "source.txt").write_text("one\ntwo\nthree\n", encoding="utf-8")
    run_git(root, "add", "source.txt")
    run_git(root, "commit", "-m", "initial")
    if remote:
        run_git(root, "remote", "add", "origin", remote)
    return run_git(root, "rev-parse", "HEAD")


def make_request(workspace: Path, reference: Path, revision: str) -> dict:
    return {
        "question": "How does the reference preserve source identity?",
        "origin": {
            "workflow": "product-readiness",
            "unresolvedQuestion": "Choose the source identity contract",
            "resumeTarget": "Product question RR-1",
        },
        "evidenceNeeded": ["source code and failure boundaries"],
        "workspace": str(workspace),
        "referenceTargets": [
            {
                "name": "reference",
                "kind": "source-repository",
                "location": str(reference),
                "revision": revision,
                "focus": ["identity"],
                "mustInspect": ["source.txt"],
            }
        ],
        "reportPath": str(workspace / "docs" / "research" / "report.md"),
    }


def valid_report(revision: str, url_override: str | None = None) -> str:
    url = url_override or (
        "https://github.com/example/reference/blob/"
        f"{revision}/source.txt#L1-L2"
    )
    return f"""---
title: Reference research test
research_status: COMPLETE
originating_workflow: product-readiness
resume_target: Product question RR-1
question: How does the reference preserve source identity?
---

# Reference research test

## 研究范围

- 研究问题：How does the reference preserve source identity?
- 原调用工作流：product-readiness
- 待恢复问题：Choose the source identity contract
- 返回目标：Product question RR-1

## 直接回答

The fixed source identifies the observed behaviour.

## 来源清单

| 参考对象 | 类型 | 位置 | 固定身份 | 实际读取范围 |
| --- | --- | --- | --- | --- |
| reference | source-repository | local | {revision} | source.txt |

## 证据台账

### RR-E001

- 结论：The first two lines are stable at the fixed revision.
- 证据类型：源码事实（`FACT_FROM_CODE`）
- 来源：[{url}]({url})
- 摘录：one / two
- 证明：The cited revision contains the two lines.
- 不能证明：It does not prove a product version contract.

## 横向比较

### RR-C001

- 比较维度：identity
- 参考实现：Git commit
- 当前产品：formal product identity
- 实质差异：technical and product identities differ
- 产品影响：requires translation
- 证据：RR-E001

## 可迁移性判断

| 比较 ID | 分类 | 原因 | 受保护的产品边界 |
| --- | --- | --- | --- |
| RR-C001 | 需要适配转译（`ADAPTER_REQUIRED`） | identities differ | product identity |

## 优化候选

### RR-O001

- 状态：待用户确认（`PROPOSED_NOT_CONFIRMED`）
- 当前问题：identity translation is implicit
- 建议改变：make translation explicit
- 支撑证据：RR-E001
- 影响对象：research evidence
- 影响决定：Product question RR-1
- 预期收益：traceability
- 风险：overfitting
- 不可迁移边界：a commit is not a product version
- 下一验证：`PRODUCT_QUESTION`

## 未验证项

- 无。

## 返回原流程

- 原调用工作流：product-readiness
- 待恢复问题：Choose the source identity contract
- 返回目标：Product question RR-1
- 建议的下一工作流：无

## 工作树变化

- 新增：report.md
- 修改：无
- 暂存：否
- 提交：否
- 推送：否
"""


class PrepareTests(unittest.TestCase):
    def test_prepare_pins_identity_without_mutating_repositories(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(
                reference, "https://github.com/example/reference.git"
            )
            before_workspace = run_git(workspace, "status", "--porcelain")
            before_reference = run_git(reference, "status", "--porcelain")

            session = prepare_request(make_request(workspace, reference, revision))

            self.assertEqual(session["phase"], "SCOPE_LOCKED")
            self.assertEqual(session["referenceTargets"][0]["revision"], revision)
            self.assertTrue(session["referenceTargets"][0]["headMatchesRevision"])
            self.assertTrue(session["baselineIdentity"].startswith("sha256:"))
            self.assertEqual(run_git(workspace, "status", "--porcelain"), before_workspace)
            self.assertEqual(run_git(reference, "status", "--porcelain"), before_reference)

    def test_prepare_blocks_remote_repository_without_full_commit(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            init_repo(workspace)
            request = make_request(workspace, workspace, "HEAD")
            request["referenceTargets"][0]["location"] = (
                "https://github.com/example/reference"
            )
            session = prepare_request(request)
            self.assertEqual(session["phase"], "BLOCKED")
            self.assertTrue(
                any("40-character commit" in item["message"] for item in session["issues"])
            )

    def test_prepare_blocks_report_outside_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference)
            request = make_request(workspace, reference, revision)
            request["reportPath"] = str(root / "outside.md")

            session = prepare_request(request)

            self.assertEqual(session["phase"], "BLOCKED")
            self.assertTrue(
                any("inside the workspace" in item["message"] for item in session["issues"])
            )

    def test_prepare_blocks_report_in_protected_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference)
            request = make_request(workspace, reference, revision)
            request["protectedPaths"] = ["docs"]

            session = prepare_request(request)

            self.assertEqual(session["phase"], "BLOCKED")
            self.assertTrue(
                any("Report path is protected" in item["message"] for item in session["issues"])
            )

    def test_prepare_blocks_existing_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference)
            request = make_request(workspace, reference, revision)
            report = Path(request["reportPath"])
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text("existing\n", encoding="utf-8")

            session = prepare_request(request)

            self.assertEqual(session["phase"], "BLOCKED")
            self.assertTrue(
                any("already exists" in item["message"] for item in session["issues"])
            )

    def test_prepare_blocks_nongit_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            request = make_request(workspace, workspace, "a" * 40)
            request["referenceTargets"][0]["location"] = (
                "https://github.com/example/reference"
            )

            session = prepare_request(request)

            self.assertEqual(session["phase"], "BLOCKED")
            self.assertTrue(
                any("Workspace is not a Git worktree" in item["message"] for item in session["issues"])
            )

    def test_default_report_name_supports_chinese_and_avoids_plain_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference)
            request = make_request(workspace, reference, revision)
            request["question"] = "比较文件保存语义"
            request.pop("reportPath")

            session = prepare_request(request)

            self.assertEqual(session["phase"], "SCOPE_LOCKED")
            self.assertRegex(Path(session["reportPath"]).name, r"^比较文件保存语义-[0-9a-f]{8}\.md$")

    def test_prepare_cli_returns_failure_for_blocked_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            init_repo(workspace)
            request = make_request(workspace, workspace, "HEAD")
            request["referenceTargets"][0]["location"] = (
                "https://github.com/example/reference"
            )
            request_path = root / "request.json"
            request_path.write_text(json.dumps(request), encoding="utf-8")

            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPTS_DIR / "reference_research.py"),
                    "prepare",
                    str(request_path),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                check=False,
            )

            self.assertEqual(completed.returncode, 1)
            self.assertEqual(json.loads(completed.stdout)["phase"], "BLOCKED")


class CitationTests(unittest.TestCase):
    def test_citation_reads_fixed_revision_not_dirty_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(
                reference, "https://github.com/example/reference.git"
            )
            session = prepare_request(make_request(workspace, reference, revision))
            (reference / "source.txt").write_text("changed\nworking\ntree\n", encoding="utf-8")

            citation = create_citation(session, "reference", "source.txt", "1:2")

            self.assertEqual(citation["excerpt"], "one\ntwo")
            self.assertIn(f"/blob/{revision}/source.txt#L1-L2", citation["fixedUrl"])
            self.assertEqual(citation["lines"], "1:2")

    def test_citation_rejects_large_excerpt(self) -> None:
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            create_citation(
                {"referenceTargets": []}, "missing", "source.txt", "1:26"
            )


class ValidationTests(unittest.TestCase):
    def _prepared(self, root: Path) -> tuple[dict, Path, str]:
        workspace = root / "workspace"
        reference = root / "reference"
        init_repo(workspace)
        revision = init_repo(reference, "https://github.com/example/reference.git")
        session = prepare_request(make_request(workspace, reference, revision))
        report = Path(session["reportPath"])
        report.parent.mkdir(parents=True, exist_ok=True)
        return session, report, revision

    def test_valid_report_and_only_allowed_report_change_pass(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            session, report, revision = self._prepared(Path(temp))
            report.write_text(valid_report(revision), encoding="utf-8")

            result = validate_report(session, report)

            self.assertTrue(result["valid"], result["errors"])
            self.assertEqual(result["researchStatus"], "COMPLETE")
            self.assertEqual(result["workspaceChange"]["created"], ["docs/research/report.md"])
            self.assertFalse(result["workspaceChange"]["staged"])
            self.assertFalse(result["workspaceChange"]["committed"])

    def test_floating_source_link_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            session, report, revision = self._prepared(Path(temp))
            floating = "https://github.com/example/reference/blob/main/source.txt#L1-L2"
            report.write_text(valid_report(revision, floating), encoding="utf-8")

            result = validate_report(session, report)

            codes = {item["code"] for item in result["errors"]}
            self.assertIn("FLOATING_SOURCE_LINK", codes)

    def test_not_found_cannot_claim_absolute_absence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            session, report, revision = self._prepared(Path(temp))
            text = valid_report(revision).replace("FACT_FROM_CODE", "NOT_FOUND")
            text = text.replace(
                "The first two lines are stable at the fixed revision.",
                "该合同确定不存在。",
            )
            report.write_text(text, encoding="utf-8")

            result = validate_report(session, report)

            codes = {item["code"] for item in result["errors"]}
            self.assertIn("OVERSTATED_NOT_FOUND", codes)

    def test_change_to_preexisting_dirty_file_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference, "https://github.com/example/reference.git")
            dirty = workspace / "source.txt"
            dirty.write_text("dirty before research\n", encoding="utf-8")
            session = prepare_request(make_request(workspace, reference, revision))
            dirty.write_text("changed during research\n", encoding="utf-8")
            report = Path(session["reportPath"])
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text(valid_report(revision), encoding="utf-8")

            result = validate_report(session, report)

            codes = {item["code"] for item in result["errors"]}
            self.assertIn("UNEXPECTED_WORKSPACE_CHANGE", codes)
            self.assertIn("source.txt", result["workspaceChange"]["unexpected"])

    def test_change_to_existing_staged_content_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            reference = root / "reference"
            init_repo(workspace)
            revision = init_repo(reference, "https://github.com/example/reference.git")
            tracked = workspace / "source.txt"
            tracked.write_text("staged before research\n", encoding="utf-8")
            run_git(workspace, "add", "source.txt")
            session = prepare_request(make_request(workspace, reference, revision))
            tracked.write_text("staged during research\n", encoding="utf-8")
            run_git(workspace, "add", "source.txt")
            report = Path(session["reportPath"])
            report.parent.mkdir(parents=True, exist_ok=True)
            report.write_text(valid_report(revision), encoding="utf-8")

            result = validate_report(session, report)

            codes = {item["code"] for item in result["errors"]}
            self.assertIn("STAGING_DETECTED", codes)
            self.assertIn("source.txt", result["workspaceChange"]["unexpected"])

    def test_branch_change_with_same_head_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            session, report, revision = self._prepared(Path(temp))
            run_git(Path(session["workspace"]), "switch", "-c", "research-branch")
            report.write_text(valid_report(revision), encoding="utf-8")

            result = validate_report(session, report)

            codes = {item["code"] for item in result["errors"]}
            self.assertIn("BRANCH_CHANGE_DETECTED", codes)

    def test_evidence_block_does_not_absorb_later_candidate_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            session, report, revision = self._prepared(Path(temp))
            text = valid_report(revision).replace(
                "- 风险：overfitting",
                "- 风险：Do not mistake the text FACT_FROM_TEST for a second evidence type",
            )
            report.write_text(text, encoding="utf-8")

            result = validate_report(session, report)

            self.assertTrue(result["valid"], result["errors"])


if __name__ == "__main__":
    unittest.main()
