# License source index

Use this reference to match the ecosystems of a precinct with the license sources. Only the assembly reads it. Each row has its own file in this folder.

The rows of an ecosystem stand in the order of the offer. The first row is the main one. The others carry the label "second source".

## Levels

| Level | Meaning | Grounds a finding |
| :-- | :-- | :-- |
| `version` | The answer is about this version | yes |
| `build` | The answer is about a build of this version | yes |
| `revision` | The text of a file at this commit | yes |
| `ref` | The text of a file at a label that can move. Not checked says the label could have moved | yes |
| `recipe` | The answer is about a recipe that can serve several versions. Measured error: `opencv/4.1.2` | no |
| `package` | The answer is about the newest version. Measured errors: `shiny 1.8.0`, `lubridate 1.9.3` | no |

## Ecosystems

The last column says whether the lock of the ecosystem records the license of a pin. The value `(not verified)` reads as "does not record".

A `git` pin is any pin that names a git address with a commit or a label. Examples are a Swift or Carthage entry, a submodule, a `uses:` step, a GitLab component or a git dependency of any language.

| Ecosystem | Rows in order | The lock records the license |
| :-- | :-- | :-- |
| npm | [`deps-dev`](deps-dev.md), [`npm-registry`](npm-registry.md), [`clearly-defined`](clearly-defined.md) | A part of the pins. The field `license` of an entry under `packages` in `package-lock.json`. Public repository create-react-app, lock version 2: 11 of 2 589 entries, read 2026-11-02. A `bun.lock` of the same ecosystem records no license at any pin. |
| PyPI | [`deps-dev`](deps-dev.md), [`pypi-json`](pypi-json.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| crates.io | [`deps-dev`](deps-dev.md), [`crates-io`](crates-io.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| Go | [`deps-dev`](deps-dev.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| Maven | [`deps-dev`](deps-dev.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| NuGet | [`deps-dev`](deps-dev.md), [`nuget-spec`](nuget-spec.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| RubyGems | [`deps-dev`](deps-dev.md), [`rubygems`](rubygems.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| Packagist | [`packagist`](packagist.md), [`clearly-defined`](clearly-defined.md) | Every pin. The field `license` of an entry under `packages` and `packages-dev` in `composer.lock`. Public repository symfony/demo: 153 of 153 entries, read 2026-11-02. A pin whose lock entry carries a license needs no source. |
| CocoaPods | [`cocoapods`](cocoapods.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| Debian | [`debian`](debian.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| git | [`revision-file`](revision-file.md), [`software-heritage`](software-heritage.md), [`clearly-defined`](clearly-defined.md) | (not verified) |
| git-tree | [`software-heritage`](software-heritage.md) | (not verified) |
| Hackage | [`hackage`](hackage.md) | (not verified) |
| CRAN | [`crandb`](crandb.md) | (not verified) |
| CPAN | [`metacpan`](metacpan.md) | (not verified) |
| vcpkg | [`vcpkg`](vcpkg.md) | (not verified) |
| LuaRocks | [`luarocks`](luarocks.md) | (not verified) |
| Clojars | [`clojars`](clojars.md) | (not verified) |
| opam | [`opam`](opam.md) | (not verified) |
| Elm | [`elm`](elm.md) | (not verified) |
| JSR | [`jsr`](jsr.md) | (not verified) |
| conda-forge | [`conda-forge`](conda-forge.md) | (not verified) |
| Ubuntu | [`ubuntu`](ubuntu.md) | (not verified) |
| Hex | [`hex`](hex.md) | (not verified) |
| Homebrew | [`homebrew`](homebrew.md) | (not verified) |
| Nimble | [`nimble`](nimble.md) | (not verified) |
| Pub | [`pub-dev`](pub-dev.md) | (not verified) |
| Conan | [`conan`](conan.md) | (not verified) |
