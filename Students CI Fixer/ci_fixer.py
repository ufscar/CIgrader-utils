import re
import os
import mosspy
import argparse
import requests
import github3
import tempfile
import dotenv


def parse_input():
    parser = argparse.ArgumentParser(description='Change all students CI files')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-f", "--file", dest="file",
                       help="File with list of students' github links")
    group.add_argument("-s", "--sheet", dest="sheet",
                       help="Public Google Sheets url (or id) with list of students' "
                            "github links (https://github.com/[^/]+/[^/]+)")
    parser.add_argument("-g", "--prof-github", dest="prof_github",
                        help="Professor github (default https://github.com/ufscar/CIgrader)",
                        default="https://github.com/ufscar/CIgrader")
    parser.add_argument('-p', '--file-paths', dest="ch_files", action='append', required=True,
                        help='File path(s) to be modified inside github')

    args = parser.parse_args()

    if args.sheet is not None and 'https://docs.google.com/spreadsheets' not in args.sheet:
        args.sheet = f'https://docs.google.com/spreadsheets/d/{args.sheet}/edit'

    return args


def update_files(students, prof, files):
    git = github3.GitHub(token=os.getenv('GITHUB_TOKEN'))
    prof_user, prof_repo = prof.split('/')
    prof_repo = git.repository(prof_user, prof_repo)
    sha = [f for f in prof_repo.directory_contents('')
           if f[0] == '.github'][0][1].sha
    print(sha, prof)
    for i in range(len(files)):
        file_contents = prof_repo.file_contents(path=files[i])
        files[i] = (files[i], file_contents.sha, file_contents.decoded)
    for own_repo in students:
        student, repo = own_repo.split('/')
        if repo.endswith('.git'):
            repo = repo[:-4]
        try:
            repo = git.repository(student, repo)
            st_sha = [f for f in repo.directory_contents('')
                      if f[0] == '.github'][0][1].as_dict()['sha']
            print(st_sha, own_repo)
            if st_sha == sha:
                continue
            for f_path, f_sha, f_content in files:
                print(f_sha, f_path, end='\t\t')
                contents = repo.file_contents(path=f_path)
                if f_sha != contents.sha:
                    contents.update(message=f'update CI file "{f_path}"',
                                    content=f_content
                                    )
                    print('UPDATED NOW')
                else:
                    print('WAS ALREADY UPDATED')

        except github3.exceptions.NotFoundError as err:
            print(f'NOT FOUND: {err}')
            continue
    return sha


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

    args.prof_github = args.prof_github.replace('https://github.com/', '')
    with tempfile.TemporaryDirectory() as folder:
        sha = update_files(students=githubs,
                           prof=args.prof_github,
                           files=args.ch_files
                           )
        print(sha, args.prof_github)
