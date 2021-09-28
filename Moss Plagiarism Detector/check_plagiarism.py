import re
import os
import mosspy
import argparse
import requests
import github3
import tempfile
import dotenv

report_html = "report.html"
report_txt = "report.txt"


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
    parser.add_argument("-m", "--min", dest="min", type=int, default=0,
                        help="Minimum similarity to be shown")
    parser.add_argument("-x", "--exclude", dest="exc", action='append', default=[],
                        help="Students not to be checked (github usernames)")
    parser.add_argument("-i", "--only", dest="only", action='append', default=[],
                        help="Students to be checked (github usernames)")
    parser.add_argument("-S", "--show", dest="show", action='store_true', default=False,
                        help="Show results in standard output")
    parser.add_argument("-X", "--exclude-files", dest="excf", action='append', default=[],
                        help="Files not to be checked")
    parser.add_argument("-e", "--equals", dest="equals", action='store_true', default=False,
                        help="Just compare files with the same filenames")

    args = parser.parse_args()
    if args.file is not None and not os.path.exists(args.file):
        raise argparse.ArgumentTypeError('Input file does not exists')
    if args.sheet is not None and 'https://docs.google.com/spreadsheets' not in args.sheet:
        args.sheet = f'https://docs.google.com/spreadsheets/d/{args.sheet}/edit'
    if args.out is not None and not os.path.exists(args.out):
        os.makedirs(args.out)

    return args


def check_plagiarism(pattern, language, output_folder=None, show=False, min=0, only_equals=False):
    userid = int(os.getenv('MOSS_USER'))

    m = mosspy.Moss(userid, language)

    m.addFilesByWildcard(pattern)
    url = m.send(lambda file_path, display_name: print('*', end='', flush=True))
    print()

    m.saveWebPage(url, report_html)
    if output_folder is not None:
        mosspy.download_report(url,
                               output_folder,
                               connections=8,
                               log_level=20,
                               on_read=lambda url: print('*', end='', flush=True)
                               )
        print()
    if show:
        with open(report_html) as f:
            html = f.read()
        l = list()
        for line in re.findall(r'(<TR><TD><A HREF="(http://moss\.stanford\.edu/results/[^"]+)">([^(]+)\((\d+)%\)</A>\s*<TD><A HREF="http://moss\.stanford\.edu/results/[^"]+">([^(]+)\((\d+)%\)</A>\s*<TD ALIGN=right>\d+)', html):
            student1 = line[2].split('/')[3]
            student2 = line[4].split('/')[3]
            urli = line[1]
            x = max(int(line[3]), int(line[5]))
            file1 = line[2].split('/')[-1].strip()
            file2 = line[4].split('/')[-1].strip()
            if student1 == student2 or x < min or (only_equals and file1 == file2):
                html = html.replace(line[0], '')
            else:
                l.append((x, f'{urli} => {student1} ({file1}) / {student2} ({file2}) ({x}%)'))
        output = '\n'.join(line for _, line in sorted(l)[::-1])
        print(output)
        print(f'{len(l)} pares detectados!')
        if output_folder is None:
            os.remove(report_html)
        with open(report_txt, 'w') as f:
            f.write(output)
    return url


def download_files(task, githubs, folder, exclude_files=None):
    if exclude_files is None:
        exclude_files = []
    git = github3.GitHub(token=os.getenv('GITHUB_TOKEN'))
    for own_repo in githubs:
        print(own_repo)
        student, repo = own_repo.split('/')
        if repo.endswith('.git'):
            repo = repo[:-4]
        try:
            repo = git.repository(student, repo)
            repo_tasks = [f[0] for f in repo.directory_contents('')]
            if task in repo_tasks:
                student_folder = os.path.join(folder, student)
                if not os.path.exists(student_folder):
                    os.makedirs(student_folder)
                exs = repo.directory_contents(task)
                for ex in exs:
                    try:
                        if ex[0] not in exclude_files:
                            print(ex[0])
                            with open(os.path.join(student_folder, ex[0]), 'wb') as f:
                                f.write(repo.file_contents(ex[1].path).decoded)
                    except Exception as err:
                        print(err)
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

    githubs = [g for g in githubs if g.split('/')[0] not in args.exc]
    if len(args.only) > 0:
        githubs = [g for g in githubs if g.split('/')[0] in args.only]
    with tempfile.TemporaryDirectory() as folder:
        download_files(args.task, githubs, folder,
                       exclude_files=args.excf)
        url = check_plagiarism(os.path.join(folder, "*", "ex*.py"),
                               language=args.lang,
                               output_folder=args.out,
                               show=args.show,
                               min=args.min,
                               only_equals=args.equals)
        print(url)
