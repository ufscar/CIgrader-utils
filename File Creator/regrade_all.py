import json
import os
import github3
import dotenv

from datetime import datetime as dt2


if __name__ == '__main__':
    dotenv.load_dotenv()
    students = []
    with open('info.txt') as f:
        for line in f:
            students.append(tuple(line.split('\t')))

    git = github3.GitHub(token=os.getenv('GITHUB_TOKEN'))
    for own_repo, nota in students:
        print(own_repo, nota)
        if float(nota) <= 10:
            continue
        student, repo = own_repo.split('/')
        if repo.endswith('.git'):
            repo = repo[:-4]
        try:
            repo = git.repository(student, repo)
            repo.create_file(message='lista01 extra',
                             path='comments/regraded.txt',
                             content=bytes(dt2.now().strftime('%Y-%m-%d %H:%M:%S'), encoding='ascii')
                             )

        except github3.exceptions.NotFoundError as err:
            print(f'FOUND: {err}')
            continue
