import re
import os
import argparse
import requests
import github3
import tempfile
import dotenv

from datetime import datetime as dt2


def parse_input():
    parser = argparse.ArgumentParser(description='Change all students CI files')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-f", "--file", dest="file",
                       help="File with list of students' github links")
    group.add_argument("-s", "--sheet", dest="sheet",
                       help="Public Google Sheets url (or id) with list of students' "
                            "github links (https://github.com/[^/]+/[^/]+)")
    parser.add_argument("-p", "--prof-repository", dest="prof",
                        help="Professor repository")
    parser.add_argument("-t", "--task", dest="task", help="Task to be grades")

    args = parser.parse_args()

    if args.sheet is not None and 'https://docs.google.com/spreadsheets' not in args.sheet:
        args.sheet = f'https://docs.google.com/spreadsheets/d/{args.sheet}/edit'

    if args.task is not None and args.prof is None:
        parser.error('--task requires --prof-repository')

    return args


def regrade(students):
    git = github3.GitHub(token=os.getenv('GITHUB_TOKEN'))
    for own_repo in students:
        print(own_repo)
        student, repo = own_repo.split('/')
        if repo.endswith('.git'):
            repo = repo[:-4]
        try:
            repo = git.repository(student, repo)
            try:
                contents = repo.file_contents(path='comments/regraded.txt')
                contents.update(message=f'Regrading...',
                                content=bytes(dt2.now().strftime('%Y-%m-%d %H:%M:%S'), encoding='ascii')
                                )
            except github3.exceptions.NotFoundError:
                repo.create_file(message='Regrading...',
                                 path='comments/regraded.txt',
                                 content=bytes(dt2.now().strftime('%Y-%m-%d %H:%M:%S'), encoding='ascii')
                                 )
        except github3.exceptions.NotFoundError as err:
            print(f'NOT FOUND: {err}')
            continue


if __name__ == '__main__':
    args = parse_input()
    dotenv.load_dotenv()
    githubs = []
    if args.file is not None:
        with open(args.file) as f:
            githubs = [line.replace('https://github.com/', '')
                       for line in f.read().splitlines()]
    elif args.sheet is not None:
        r = requests.get(args.sheet)
        if not r.ok:
            raise Exception('Google Sheets URL not found')
        githubs = re.findall(r'>https://github.com/([^/]+/[^/"\\]+)<', str(r.content, encoding='utf8'))

    if args.task is None:
        regrade(githubs)
    else:
        curr = os.path.split(os.path.abspath(__file__))[0]
        print(curr)
        for github in githubs:
            os.system(f'python3 "{curr}/../Local Grader/grade.py" -p {args.prof} -t {args.task} -r {github}')
