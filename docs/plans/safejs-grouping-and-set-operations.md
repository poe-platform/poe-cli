# Grouping and Set operation gaps

## Validated current evidence

The built RelativeTimeFormat candidate lacks Object.groupBy and Map.groupBy
as own static properties. Calls grouping [1,2,3] by x % 2 both reject with
TypeError. Set.prototype lacks union, intersection, difference,
symmetricDifference, isSubsetOf, isSupersetOf and isDisjointFrom.
The concrete union of Sets [1,2] and [2,3] also rejects with TypeError.
No implementation matches were found in the current interpreter.

These are core language API gaps, separate from legacy Annex B inventory,
host APIs and the remaining Intl constructors.

## Atomic implementation order

1. Object.groupBy and Map.groupBy share the specified grouping algorithm.
   Validate iterator acquisition/closing, callback callability and this,
   index progression, key coercion for Object, key identity and negative zero
   for Map, null-prototype Object results, symbols, safe __proto__ grouping,
   insertion order and generator input with failing tests first.
2. Implement Set operations from their set-like protocol, not just native Set
   input. Validate size/has/keys getter order, required callability, NaN and
   negative sizes, receiver branding, iteration order, mutation during
   callbacks and early iterator closing. Derive exact ordering and branches
   from the specification before coding.

Each coherent improvement needs guest budget accounting, snapshot coverage,
focused maintained checks and its own commit/direct push to main.
The full RelativeTimeFormat run was terminal before grouping edits began:
20,529 passed and six still-open weak-collection/promise-import failures.

## Grouping implementation verification

The initial 20 native differential tests failed before implementation, then
passed with a shared grouping implementation. Additional cases cover bounded
group arrays from generators, retained groups during producer allocation,
fatal iterator cleanup, completed replay and repeated heap restoration with
symbol keys and shared-object identity.

Final focused and nearby constructor/collection/legacy graph checks:
165 passed, one existing skip across seven files. The selected SafeJS build
closure passed all 23 builds plus four fresh export initialization checks.
Twenty built grouping probes passed on Node 18.18.0 and Node 24.14.0.
Node 18 expectations were derived from the native Node 22 oracle because
Node 18 itself has no grouping APIs. No host groupBy implementation is needed
by the guest runtime.

This delivery covers grouping only. Set operations remain the next separate
atomic improvement, and the broader goal is not complete.
