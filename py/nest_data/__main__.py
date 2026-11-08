"""python -m nest_data: the same as the nest command."""

import sys

from .cli import main

sys.exit(main())
