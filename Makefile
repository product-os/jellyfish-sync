.PHONY: lint \
	test

# See https://stackoverflow.com/a/18137056
MAKEFILE_PATH := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# -----------------------------------------------
# Test Runtime Configuration
# -----------------------------------------------

TEST_INTEGRATION_GITHUB_REPO ?= product-os/jellyfish-test-github
export TEST_INTEGRATION_GITHUB_REPO
TEST_INTEGRATION_FRONT_INBOX_1 ?= inb_qf8q # Jellyfish Testfront
export TEST_INTEGRATION_FRONT_INBOX_1
TEST_INTEGRATION_FRONT_INBOX_2 ?= inb_8t8y # Jellyfish Test Inbox
export TEST_INTEGRATION_FRONT_INBOX_2
TEST_INTEGRATION_DISCOURSE_CATEGORY ?= 44 # sandbox
export TEST_INTEGRATION_DISCOURSE_CATEGORY
TEST_INTEGRATION_DISCOURSE_USERNAME ?= jellyfish
export TEST_INTEGRATION_DISCOURSE_USERNAME
TEST_INTEGRATION_DISCOURSE_NON_MODERATOR_USERNAME ?= jellyfish-test
export TEST_INTEGRATION_DISCOURSE_NON_MODERATOR_USERNAME

# -----------------------------------------------
# Build Configuration
# -----------------------------------------------

# To make sure we don't silently swallow errors
NODE_ARGS = --abort-on-uncaught-exception --stack-trace-limit=100
NODE_DEBUG_ARGS = $(NODE_ARGS) --trace-warnings --stack_trace_on_illegal

# User parameters
FIX ?=
ifeq ($(FIX),)
ESLINT_OPTION_FIX =
else
ESLINT_OPTION_FIX = --fix
endif

AVA_ARGS = $(AVA_OPTS)
ifndef CI
AVA_ARGS += --fail-fast
endif
ifdef MATCH
AVA_ARGS += --match $(MATCH)
endif

FILES ?= "'./{lib,test}/**/*.spec.js'"
export FILES

# Set dotenv variables for local development/testing
ifndef CI
    # Defaults are set in local.env
    ifneq ("$(wildcard local.env)","")
        include local.env
        export $(shell sed 's/=.*//' local.env)
    endif

    # Developers can override local.env with a custom.env
    ifneq ("$(wildcard custom.env)","")
        include custom.env
        export $(shell sed 's/=.*//' custom.env)
    endif
endif

# -----------------------------------------------
# Rules
# -----------------------------------------------

lint:
	npx eslint --ext .js $(ESLINT_OPTION_FIX) lib
	npx jellycheck
	npx deplint
	npx depcheck --ignore-bin-package

test:
	node $(NODE_DEBUG_ARGS) ./node_modules/.bin/ava -v $(AVA_ARGS) $(FILES)
