# Lint CLI output and exit codes

Run the built-in lint rules for a supported MEFF model:

```sh
archimate-js lint ./model.xml
archimate-js lint ./model.xml --format json
```

Human output is the default. JSON output is formatted with stable property
order and contains `command`, `result`, every finding (including subject and
optional remediation), rule diagnostics, execution details, and severity
counts. The lint engine sorts findings deterministically. Both formats report
the same findings and use the same exit status. Successful reports contain no
input path or model XML; finding messages may include identifiers needed to
locate the reported concept.

The command imports the XML through the existing ModelDto API and then runs the
built-in lint rules. It does not load rule configuration, search for parent
configuration, or load plugins.

Exit statuses:

| Status | Meaning |
| ---: | --- |
| `0` | No error-severity findings. Warning and info findings are allowed. |
| `1` | One or more error-severity findings. |
| `2` | Usage, file read, model import/validation, configuration, or lint-engine failure. |

Input and engine failures use safe diagnostic messages. They do not include
local file paths, model XML, parser exceptions, or stacks. Rule execution
diagnostics remain visible in a completed report and produce status `2` because
the engine could not complete every configured rule.
