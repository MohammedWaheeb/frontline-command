.PHONY: doctor dev test test-extended test-browser check-content build play demo lan

doctor dev test test-extended test-browser check-content build play demo lan:
	@node scripts/local.mjs $@
