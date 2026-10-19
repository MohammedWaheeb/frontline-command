.PHONY: doctor dev test test-extended test-browser check-content build play lan

doctor dev test test-extended test-browser check-content build play lan:
	@node scripts/local.mjs $@
