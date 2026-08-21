# ADR-0012 — P9's three worked examples (the as-merged C++ `NetForward`)

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0012-compositional-and-structural-hygiene.md` at commit `0f7b3e4` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

These are P9's ("Functional core, imperative shell") three long worked examples,
diagnosing the as-merged interim C++ `NetForward` MLP (chocofarm's leaf-evaluator)
against the five checkable rules: the anchor example walks rules 1 and 2 (raw
pointers in, out-parameters instead of return-by-value); the error-axis example
walks rule 5's failure half (exceptions at boundaries vs. a total functional
core); the optionality-axis example walks rules 1 and 5's absence half (a
nullable raw pointer standing in for `std::optional`). Each names the as-merged
violation, the compliant form, and — for the CLI helper — a worked code diff.
The parent ADR keeps P9's five rules and the general modern-C++ posture in force
verbatim; only this dated, source-project-specific diagnostic narrative moved.

---

**Worked example (the anchor).** The C++ `NetForward` MLP
(`cpp/include/chocofarm/net.hpp`, `cpp/src/net.cpp`) is the cautionary
instance. Its leaf-evaluator entry point `NetPrediction predict(const float* X)
const` does return by value (rule 2 met) — but it takes a **raw `const float*`
with no length** (rule 1 violated: the caller must already know `in_dim_`, and
the body trusts the pointer addresses that many floats — exactly the
bounds-erasure `std::span<const float>` exists to close; the sibling
`predict(const std::vector<float>&)` overload only re-derives the length to
guard *one* caller, not the raw-pointer path the search will actually use). The
internals are the **untyped-effectful void** in full: `void matvec_bias(const
float* in, const std::vector<float>& W, int rows, int cols, const float* bias,
std::vector<float>& out)` takes two raw pointers and an `int rows, int cols`
pair (no bounds, no const-carrying view) and returns its result by **writing
through `std::vector<float>& out`**; `void require_matrix(…, int& rows, int&
cols, std::vector<float>& out)` returns `void` while writing **three**
out-parameters and `void require_vector(…, int& len, std::vector<float>& out)`
**two**, in place of returning a small typed result; `void
relu_inplace(std::vector<float>& v)` is a void in-place mutation.
None of these can be unit-tested as value-functions or chained, and none
declares its contract in its signature. The **compliant form**: the matmul is a
pure value-function — `std::vector<float> matvec_bias(std::span<const float> in,
std::span<const float> W, int rows, int cols, std::span<const float> bias)`
returning its result by value (free under NRVO), `relu` returning a new vector
(or taking and returning by value), and `require_matrix`/`require_vector`
returning a small typed result struct rather than writing those out-params; the
public entry becomes `predict(std::span<const float> x, const WeightPayload& w)
-> NetPrediction` (value-returned), with the per-layer matmul scratch — **if and
only if** a measured allocation profile on the search's leaf loop shows the
per-`predict` `std::vector` churn matters — moved into a typed
`ForwardWorkspace&` parameter, leaving the core otherwise pure and still
returning `NetPrediction` by value. The as-merged interim `NetForward` predates
P9 (it is the live instance that **motivated** the rule) and is to be brought
into compliance; per the no-retroactive-sweep scoping it is retrofitted on
touch, not by a P9 sweep.

**Worked example (the error axis, rule 5).** Every `throw` in `cpp/src` today is
a `std::runtime_error`, and every one of them is at a **boundary** — none on the
hot path: `transport.cpp` (redis connect/GET/SET, and the missing-weight-payload
abort mirroring `read_weights`), `instance.cpp` (the instance-file/JSON load),
and the `NetForward` **constructor** with its `require_matrix`/`require_vector`
helpers, which validate the manifest at construction. The forward compute itself
(`predict(const float* X)`, `matvec_bias`, `relu`) and the search that will call
it are **throw-free** — the only `throw` reachable from a `predict` overload is
the length guard at the *boundary* of the `vector`-taking entry, not on the raw-
pointer compute path the search uses. So the core is already total; what rule 5
adds is that the boundary's failures should be **typed return values, not
thrown.** The compliant form returns `[[nodiscard]] std::expected<…, Error>`
from those boundary functions (`read_weights`, the instance loader,
`require_matrix`/`require_vector`), so a caller cannot ignore the error path
without a compile error; `NetForward`'s construction — a throwing ctor cannot
return a value — becomes a `NetForward::create(const WeightPayload&) ->
std::expected<NetForward, Error>` factory over a private `noexcept` ctor.
The forward/search core stays total and exception-free, exactly as it is today.
The distinction rule 5 draws against the as-merged code: those manifest-shape
checks are **recoverable boundary conditions** (a malformed payload an upstream
produced, a missing redis key an operator can be told about) — they are
`expected`, not `assert`. A `matvec_bias` indexing past `cols` because the
caller passed an `in_dim_`/`hidden_` the constructor already reconciled would be
the other category — an **invariant violation**, a bug, an `assert`/abort — and
it never becomes an `expected`.

**Worked example (the optionality axis, rules 1 & 5).** The CLI helper in
`cpp/src/main.cpp` is the live **untyped-optional** instance:

```cpp
const char* opt(int argc, char** argv, const char* name) {
    for (int i = 1; i + 1 < argc; ++i)
        if (std::strcmp(argv[i], name) == 0) return argv[i + 1];
    return nullptr;                  // "not found" as a nullable raw pointer
}
```

It parses `--instance`, `--phase`, `--lam`, etc., and returns `nullptr` when
the flag is absent — and absence here **is a legitimate, expected outcome** (an
optional flag the user simply did not pass), not a failure. So this is exactly
the absence rule 5 names, encoded the forbidden way: an **untyped optional** (a
nullable `const char*` whose absence is invisible in the type — a caller that
forgets the null-check dereferences `nullptr`, undefined behavior the type never
warned against) that is **also** a raw-pointer in *and* out (rule 1: raw `char**`
input, raw `const char*` output). It is the C++ sentinel ADR-0002 names, and a
P8 dishonest contract (the type does not carry the nullability the callers
rely on). The **compliant form** makes the absence typed and the pointers views:

```cpp
[[nodiscard]] std::optional<std::string_view>
opt(std::span<const std::string_view> args, std::string_view name);
```

— `std::optional` (not `expected`: a missing flag is routine absence, not an
error) carries the "might be nothing" in the return type, `[[nodiscard]]` makes
ignoring it a compile error, and `std::string_view` replaces the raw pointers in
and out. The **imperative shell** does the one untyped→typed translation at the
boundary, building the typed view once in `main`:

```cpp
std::vector<std::string_view> args{argv, argv + argc};   // the ACL, once
```

This is the boundary acting as the **Port/ACL** (P2) that translates the untyped
`argv` the OS hands it into typed values the core consumes — **not an excuse to
keep the raw pointers** flowing inward. The single `argv`→`string_view` decode
is the sanctioned translate-at-the-edge; every signature downstream of it is
typed. (This `opt` helper predates P9 and is **retrofitted on touch** — it falls
in `#28`'s scope — per the no-retroactive-sweep scoping, not swept for its own
sake.) The reflex to wave this off as "it's just CLI parsing, the absence is
obvious" is **the exact rationalization this tenet rejects**: a nullable
`const char*` is an untyped optional whether it parses argv or a redis payload,
the missed null-check is the same undefined behavior, and "it's just X" is the
scale/minimality tell P7/P8 already named — the discipline declined "just this
once at the edge" is precisely how the cancers grew.
