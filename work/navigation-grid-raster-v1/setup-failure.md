# Initial setup failure

The first test-file write used a root-relative path from the private source directory and failed before creating the file. The subsequently launched selector ran no matching tests; its log remains focused-01.log and is not acceptance. Corrected file creation uses the explicit project root; focused-02 is the first actual test attempt.
