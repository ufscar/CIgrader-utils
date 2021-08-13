from optparse import OptionParser

if __name__ == '__main__':
    parser = OptionParser()
    parser.add_option("-l", "--language", dest="lang",
                      help="Files programming language")
    parser.add_option("-f", "--file", dest="file",
                      help="List of students gitlab links file")
    parser.add_option("-s", "--sheet", dest="sheet",
                      help="List of students gitlab links google sheets url")

    (options, args) = parser.parse_args()