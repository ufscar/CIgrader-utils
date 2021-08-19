import re
import os
import mosspy
import argparse
import requests
import github3
import tempfile
import dotenv


def parse_input():
    parser = argparse.ArgumentParser(description="Check for plagiarism one task of all students")
    parser.add_argument("-l", "--language", dest="lang", required=True,
                        help="Files programming language")
    parser.add_argument("-t", "--task", dest="task", required=True,
                        help="Task to be tested")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-f", "--file", dest="file",
                       help="File with list of students' github links")
    group.add_argument("-s", "--sheet", dest="sheet",
                       help="Public Google Sheets url (or id) with list of students' "
                            "github links (https://github.com/[^/]+/[^/]+)")
    parser.add_argument("-o", "--out", dest="out",
                        help="Output folder (default is empty, prints only url)")

    args = parser.parse_args()
    if args.file is not None and not os.path.exists(args.file):
        raise argparse.ArgumentTypeError('Input file does not exists')
    if args.sheet is not None and 'https://docs.google.com/spreadsheets' not in args.sheet:
        args.sheet = f'https://docs.google.com/spreadsheets/d/{args.sheet}/edit'
    if args.out is not None and not os.path.exists(args.out):
        os.makedirs(args.out)

    return args


def check_plagiarism(pattern, language, output_folder=None):
    userid = int(os.getenv('MOSS_USER'))

    m = mosspy.Moss(userid, language)

    m.addFilesByWildcard(pattern)
    url = m.send(lambda file_path, display_name: print('*', end='', flush=True))
    print()

    if output_folder is not None:
        m.saveWebPage(url, "report.html")
        mosspy.download_report(url,
                               output_folder,
                               connections=8,
                               log_level=20,
                               on_read=lambda url: print('*', end='', flush=True)
                               )
        print()
    return url


def download_files(task, githubs, folder):
    git = github3.GitHub(token=os.getenv('GITHUB_TOKEN'))
    for own_repo in githubs:
        print(own_repo, end='\t')
        student, repo = own_repo.split('/')
        try:
            repo = git.repository(student, repo)
            repo_tasks = [f[0] for f in repo.directory_contents('')]
            if task in repo_tasks:
                student_folder = os.path.join(folder, student)
                if not os.path.exists(student_folder):
                    os.makedirs(student_folder)
                exs = repo.directory_contents(task)
                for ex in exs:
                    with open(os.path.join(student_folder, ex[0]), 'wb') as f:
                        f.write(repo.file_contents(ex[1].path).decoded)
            print()
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

    with tempfile.TemporaryDirectory() as folder:
        download_files(args.task, githubs, folder)
        url = check_plagiarism(os.path.join(folder, "*", "ex*.py"),
                               language=args.lang,
                               output_folder=args.out)
        print(url)
