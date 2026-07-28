# Skill Authoring Track

Teach the learner to create predictable skills with clear invocation, progressive disclosure, deterministic scripts, and registry-safe maintenance.

## SA-01: Design the invocation contract

**Outcome:** The learner can define one skill with a distinct trigger and completion criterion.

**Concept:** A skill earns model invocation through a distinct leading word or independent workflow. Manual skills reduce context load when the learner can choose them directly.

**Learner action:** Choose one repeated workflow from `requests/skill-idea.md`. Create `learner-artifacts/authoring-invocation-contract.md` with skill name, leading word, concrete trigger examples, non-triggers, model or manual invocation choice, and observable completion criterion.

**Evidence:** `learner-artifacts/authoring-invocation-contract.md`

**Hint ladder:** Ask what user wording should activate it. Provide trigger/non-trigger headings. Compare an adjacent wrapper and authority skill.

**Feedback focus:** Catch vague descriptions, duplicate triggers, nouns instead of action-oriented names, and a skill that should be a reference file.

**Advance when:** Another agent can distinguish when to invoke the skill and when not to.

**Next:** `SA-02`

## SA-02: Place steps, references, scripts, and assets

**Outcome:** The learner can plan a concise skill using the information hierarchy.

**Concept:** Put immediate ordered steps in `SKILL.md`, branch-specific knowledge in references, deterministic repeated work in scripts, and copied output material in assets.

**Learner action:** Create `learner-artifacts/authoring-skill-plan.md` with proposed tree, responsibility of each file, context pointer from `SKILL.md`, degree of freedom, and no-op or duplication risks.

**Evidence:** `learner-artifacts/authoring-skill-plan.md`

**Hint ladder:** Ask whether the agent must read or execute each item. Provide the four resource categories. Show why a README inside a skill is usually clutter.

**Feedback focus:** Catch deep reference nesting, duplicated rules, oversized `SKILL.md`, scripts for judgment, and prose for fragile deterministic validation.

**Advance when:** Every planned file changes execution and each meaning has one authority.

**Next:** `SA-03`

## SA-03: Validate a draft skill

**Outcome:** The learner can initialize and validate a draft without editing the installed course source.

**Concept:** Use the standard initializer, generate UI metadata from the final skill, run structural validation, and test every added script.

**Learner action:** Build the draft under `draft-skill/` in the lab. Run the available skill validator and capture commands, outputs, one corrected validation failure, and script test evidence in `learner-artifacts/authoring-validation.md`.

**Evidence:** `learner-artifacts/authoring-validation.md`

**Hint ladder:** Point to the installed `skill-creator` workflow. Offer a validation checklist. Diagnose one error only after the learner runs the validator.

**Feedback focus:** Catch hand-built invalid frontmatter, stale `openai.yaml`, untested scripts, placeholder files, and validation claims without output.

**Advance when:** The draft passes structural validation and its deterministic behavior has a repeatable test.

**Next:** `SA-04`

## SA-04: Update routing without stale names

**Outcome:** The learner can add, rename, or retire a skill without leaving broken integrations.

**Concept:** Registry maintenance includes explicit invocations, UI metadata, compatibility aliases, installation locks, transfer packs, and active project references.

**Learner action:** Create `learner-artifacts/authoring-routing-audit.md` with proposed registry change, compatibility decision, exact audit commands, integration surfaces, expected failures before repair, and acceptance criteria after repair.

**Evidence:** `learner-artifacts/authoring-routing-audit.md`

**Hint ladder:** Ask where an old name can still be invoked. Provide the integration surface list. Demonstrate `--forbid` on a fictional retired name.

**Feedback focus:** Catch directory-only renames, silent alias deletion, ignored external integrations, and audits that do not forbid the retired name.

**Advance when:** The plan proves both current registry validity and absence of the retired invocation across configured surfaces.

**Next:** Run the skill-authoring assessment or begin an authoring capstone.
