"""nest_data: the data side of Nest for the python track (ADR 0010).

Reads and validates contributors/*/profile.yml, page.md and cohorts/*/cohort.yml with the same rules as
@nest/schema, computes stage progress and practice counts, and writes the data file the Astro site reads.
"""

__version__ = "0.1.0"
