# CI Grader Utils

## Moss Plagiarism Detector

### Help

```shell
python3 check_plagiarism.py --help
```

### Environment Variables

- **MOSS_USER**: User id in moss service ([https://theory.stanford.edu/~aiken/moss/](https://theory.stanford.edu/~aiken/moss/))
- **GITHUB_TOKEN**: Github token with **repo** permission

## Grades Sheet Script

Example of script for Google Sheets automation. It depends on Worksheet template, so you will have to make some changes depending on it. This script was made for the Worksheet Template available [here](https://docs.google.com/spreadsheets/d/1jYErsQ6RZ1YrRJOFf2xQk8ZPdC8WjC8MIDFfxcJRCqA/edit?usp=sharing).

## Students CI Fixer

### Help

```shell
python3 ci_fixer.py --help
```

### Environment Variables

- **GITHUB_TOKEN**: Github token with **workflow** permission

