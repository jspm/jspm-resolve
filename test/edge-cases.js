/*
TODO Edge Cases:
- jspm project nesting
- invalidation mid-resolve
- file directly in jspm_packages
- jspm project in jspm_packages
- reaching from one jspm project into another, seeing rel maps apply
- testing edge cases around rel maps into './asdf/../../', where reaching into something else (this reaching in the first place is what doesn't go through further rel maps though, direct reaching does)
- including the above case reading into another project
- registry import with registry as capital case (plus invalid registry characters)
- careful encoding tests, ensuring all 4 resolve variations handle surjection of encodings
- version encoding through dependencies map handling
- mapping into an absolute URL
- mapping into a backtracking URL
- mapping into a /-relative URL
- mapping into an exact package with a backtrack path
- all map variations with backtracking segments after the match component
- trailing / in node_modules should throw
- empty being returned by mapping cases
 */
