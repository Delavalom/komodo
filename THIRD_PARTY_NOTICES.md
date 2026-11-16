# Third-party notices

Komodo is MIT licensed (see `LICENSE`). Parts of it are ported from the
projects below, which are licensed separately.

## OpenCodeReview

- Project: https://github.com/alibaba/open-code-review
- Licence: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
- Copyright: the OpenCodeReview authors

Ported into `packages/core/src/reflect.ts` (the `reflect` experiment) from:

- `internal/agent/agent.go`: `executeGroupReviewFilter`,
  `buildGroupFilterCommentsJSON`, `parseFilterToolCalls` and the `filterTools`
  definitions. This is the structure of a separate pass that checks finished
  comments against the diff, and the rule that the model reasons before it
  names what to remove.
- `internal/config/template/prompts/review_filter_task_system.md` and
  `review_filter_task_user.md`: the prompt. That is the lopsided cost argument,
  the two grounds for removal, the protected subjects that are never removed,
  and the order of the method.

The port is rewritten for Komodo's judgements, adds a `revise` verdict and read
access to a checkout, and takes its voice from `VOICE_STYLE.md`. It is not a
copy of OpenCodeReview's code: the files above are Go and Markdown, and what
carries over is the logic and the structure of the prompt.

Licensed under the Apache License, Version 2.0; you may obtain a copy at
http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law
or agreed to in writing, software distributed under the License is distributed
on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
express or implied.
