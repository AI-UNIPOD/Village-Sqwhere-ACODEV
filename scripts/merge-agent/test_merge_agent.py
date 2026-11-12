from pathlib import Path

import pytest

import merge_agent as agent

HOOK = Path(__file__).resolve().parents[2] / ".githooks" / "commit-msg"


def pr(**changes):
    base = {
        "number": 12,
        "title": "feat(web): add the idea form",
        "headRefName": "feat/idea-form",
        "headRefOid": "a" * 40,
        "baseRefName": "main",
        "isDraft": False,
        "isCrossRepository": False,
        "labels": [],
    }
    return base | changes


def labelled(*names):
    return [{"name": name} for name in names]


def seen(head="a" * 40, main="m1", outcome="passed"):
    return {"head": head, "main": main, "outcome": outcome}


@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        ({}, None),
        ({"isDraft": True}, "draft"),
        ({"isCrossRepository": True}, "from a fork"),
        ({"labels": labelled("do-not-merge")}, "labelled do-not-merge"),
        ({"headRefName": "main"}, "its branch is protected"),
    ],
)
def test_skips_drafts_forks_opt_outs_and_protected_branches(changes, reason):
    assert agent.skip_reason(pr(**changes)) == reason


def test_tests_a_pull_request_it_has_not_seen():
    assert agent.next_step(pr(), None, "m1") == "test"


def test_merges_without_testing_again_when_head_and_main_are_unchanged():
    assert agent.next_step(pr(), seen(), "m1") == "merge"


def test_tests_again_when_main_moved():
    assert agent.next_step(pr(), seen(main="m0"), "m1") == "test"


def test_tests_again_when_the_author_pushed():
    flagged = pr(labels=labelled(agent.FAILED))
    assert agent.next_step(flagged, seen(head="b" * 40, outcome="failed"), "m1") == "test"


def test_waits_on_a_flagged_commit_until_the_label_is_removed():
    flagged = pr(labels=labelled(agent.FAILED))
    assert agent.next_step(flagged, seen(outcome="failed"), "m1") == "wait"
    assert agent.next_step(pr(), seen(outcome="failed"), "m1") == "test"


def test_waits_for_a_person_to_review_a_resolved_conflict():
    in_review = pr(labels=labelled(agent.REVIEW))
    assert agent.next_step(in_review, seen(outcome="review"), "m1") == "wait"
    assert agent.next_step(pr(), seen(outcome="review"), "m1") == "merge"


def test_squash_commit_is_the_title_and_number():
    assert agent.squash_subject(pr()) == "feat(web): add the idea form (#12)"


def test_deletes_only_an_unchanged_unused_unprotected_branch():
    head = "a" * 40
    assert agent.may_delete_branch("feat/idea-form", head, head, [])
    assert not agent.may_delete_branch("main", head, head, [])
    assert not agent.may_delete_branch("feat/idea-form", head, "b" * 40, [])
    stacked = [pr(number=13, headRefName="feat/next", baseRefName="feat/idea-form")]
    assert not agent.may_delete_branch("feat/idea-form", head, head, stacked)


def test_leaves_ci_infra_rules_and_itself_to_a_person():
    paths = [
        "apps/web/app/page.tsx",
        ".github/workflows/ci.yml",
        "infra/db/init/010.sql",
        "AGENTS.md",
        "scripts/merge-agent/merge_agent.py",
        "apps/web/AGENTS.md",
    ]
    assert agent.flag_only(paths) == paths[1:5]


def test_finds_conflict_markers_but_not_a_markdown_heading_underline():
    assert agent.has_markers("a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> origin/main\n")
    assert agent.has_markers("a\n||||||| base\nb\n")
    assert not agent.has_markers("Title\n=======\n\ntext\n")


def test_reports_edits_outside_the_conflicted_files():
    status = "UU apps/web/a.ts\0M  apps/web/clean.ts\0 M apps/web/other.ts\0?? new.txt\0"
    assert agent.stray_edits(status, {"apps/web/a.ts"}) == ["apps/web/other.ts", "new.txt"]


def test_reads_past_the_old_path_of_a_rename():
    status = "R  apps/new.ts\0apps/old.ts\0UU apps/a.ts\0"
    assert agent.stray_edits(status, {"apps/a.ts"}) == []


def test_finds_dashes_in_changed_text_files_only(tmp_path):
    dash = "\N{EM DASH}"
    (tmp_path / "doc.md").write_text(f"one {dash} two", encoding="utf-8")
    (tmp_path / "ok.md").write_text("one, two", encoding="utf-8")
    (tmp_path / "pnpm-lock.yaml").write_text(dash, encoding="utf-8")
    (tmp_path / "logo.png").write_bytes(b"\0" + dash.encode())
    changed = ["doc.md", "ok.md", "pnpm-lock.yaml", "logo.png", "deleted.md"]
    assert agent.dash_files(changed, tmp_path) == ["doc.md"]


def test_keeps_model_text_free_of_dashes():
    text = " It failed \N{EM DASH} the test, lines 3\N{EN DASH}5. "
    assert agent.plain(text) == "It failed, the test, lines 3-5."


def test_runs_pull_request_code_in_a_locked_down_container(monkeypatch):
    monkeypatch.setenv("GH_TOKEN", "never-in-the-container")
    args = agent.runner_args("box-0", "box-net", agent.NODE_IMAGE, {"CI": "1"})

    assert args[:2] == ["docker", "create"]
    assert args[-3:] == [agent.NODE_IMAGE, "sleep", "infinity"]
    for flag in ("--cap-drop", "--security-opt", "--pids-limit", "--memory"):
        assert flag in args
    # no folder from this machine, and only the variables given
    assert not {"-v", "--volume", "--mount"} & set(args)
    assert [args[i + 1] for i, arg in enumerate(args) if arg == "-e"] == ["CI=1"]
    assert "never-in-the-container" not in " ".join(args)


def test_runs_the_commit_rule_on_titles():
    sh = agent.find_sh()
    assert agent.title_problem("feat(web): add the idea form", HOOK, sh) is None
    assert "Use: <type>" in agent.title_problem("Added new feature.", HOOK, sh)
