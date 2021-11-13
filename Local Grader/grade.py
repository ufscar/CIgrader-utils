import os
import argparse
import github3
import dotenv
import tempfile
import urllib
import requests
import stat
import subprocess
import json

from datetime import datetime as dt2

GRADER_EXEC = 'grader'
GRADER_FOLDER = 'comments'
commit_time_string = dt2.now().strftime('%Y%m%d%H%M%S')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
GIT = github3.GitHub(token=GITHUB_TOKEN)


def is_json(s):
    try:
        json.loads(s)
        return True
    except ValueError:
        return False


def parse_input():
    parser = argparse.ArgumentParser(description="Check for plagiarism one task of all students")
    parser.add_argument("-t", "--task", dest="task", required=True,
                        help="Task to be tested")
    parser.add_argument("-r", "--repository", dest="repo", required=True,
                        help="Repository to be tested")
    parser.add_argument("-p", "--prof-repository", dest="prof", required=True,
                        help="Professor repository")

    args = parser.parse_args()

    return args


def download_files(task, own_repo, folder, exclude_files=None):
    if exclude_files is None:
        exclude_files = []
    print(own_repo)
    student, repo = own_repo.split('/')
    if repo.endswith('.git'):
        repo = repo[:-4]
    repo = GIT.repository(student, repo)
    exs = repo.directory_contents(task)
    for ex in exs:
        try:
            if ex[0] not in exclude_files:
                print(ex[0])
                with open(os.path.join(folder, ex[0]), 'wb') as f:
                    f.write(repo.file_contents(ex[1].path).decoded)
        except Exception as err:
            print(err)


def download_grader(prof, task, folder):
    URI = prof.replace('https://github.com/', '')
    CONTENTS = f"https://api.github.com/repos/{URI}/contents/"
    # prof_user, prof_repo = URI.split("/")
    js = requests.get(CONTENTS).json()
    if isinstance(js, (str, bytes)):
        raise FileNotFoundError
    if task not in [f['name'] for f in js if f['type'] == 'dir']:
        raise FileNotFoundError
    prof_files = {r['name']: r["download_url"] for r in requests.get(f'{CONTENTS}/{task}').json()}
    if len(prof_files) != 1:
        raise Exception('ERROR: invalid number of grader files (warn your professor)')
    curr = os.getcwd()
    os.chdir(folder)
    urllib.request.urlretrieve(list(prof_files.values())[0], GRADER_EXEC)
    os.chmod(GRADER_EXEC, stat.S_IRWXU)
    os.chdir(curr)


def grade(task, student, folder):
    curr = os.getcwd()
    os.chdir(folder)
    own, repo = student.split('/')
    repo = GIT.repository(own, repo)
    log_file = f'{task}_{commit_time_string}.txt'
    log = subprocess.run([f'./{GRADER_EXEC}'],
                         stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT).stdout
    os.remove(GRADER_EXEC)
    repo.create_file(path=os.path.join(GRADER_FOLDER, log_file),
                     message=f'task "{task}" grader [skip ci]',
                     content=log
                     )
    log = str(log, encoding='utf8')
    print(log)
    score = log.strip().splitlines()
    if len(score) == 0:
        raise Exception('NotGraded')
    score = score[-1]
    if is_json(score):
        score_file = os.path.join(GRADER_FOLDER, f'{task}_current_score.txt')
        try:
            contents = repo.file_contents(path=score_file)
            contents.update(message=f'task "{task}" score [skip ci]',
                            content=bytes(score, encoding='utf8')
                            )
        except github3.exceptions.NotFoundError:
            repo.create_file(path=score_file,
                             message=f'task "{task}" score [skip ci]',
                             content=bytes(score, encoding='utf8')
                             )
    os.chdir(curr)


if __name__ == '__main__':
    args = parse_input()
    dotenv.load_dotenv()
    GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
    GIT = github3.GitHub(token=GITHUB_TOKEN)
    with tempfile.TemporaryDirectory() as folder:
        download_files(args.task, args.repo, folder)
        download_grader(args.prof, args.task, folder)
        grade(args.task, args.repo, folder)