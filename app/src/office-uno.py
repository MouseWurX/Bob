# -*- coding: utf-8 -*-
# Bob's office helper. Runs with the Python that comes inside LibreOffice (or Apache OpenOffice), so nothing
# else needs installing. Bob starts it for one job and it ends with the job: it starts its own hidden copy of
# LibreOffice with its own profile (so a LibreOffice window you have open is never touched), does the job,
# and closes that copy again. It never runs macros in the documents it opens.
#
# Bob sends one job as JSON on stdin and reads one JSON answer on stdout:
#   {"op": "convert", "src": "C:\\a.docx", "out": "C:\\a.pdf"}
#   {"op": "read", "src": "...", "max": 20000, "sheet": "", "formulas": false}
#   {"op": "make", "kind": "writer|calc|impress", "out": "...", "text": "...", "sheets": [...], "slides": [...]}
#   {"op": "edit", "src": "...", "out": "" (same file), "changes": [...]}
#   {"op": "info"}  (which office this is)
# Written to work on Python 2.7 (OpenOffice 4) and Python 3 (LibreOffice).
from __future__ import print_function
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue

PROFILE = os.environ.get('BOB_OFFICE_PROFILE') or os.path.join(tempfile.gettempdir(), 'bob-office-profile')
SOFFICE = os.environ.get('BOB_SOFFICE') or os.path.join(os.path.dirname(sys.executable), 'soffice.exe' if os.name == 'nt' else 'soffice')

# Save formats by the new file's ending and the kind of document.
FILTERS = {
    'writer': {'pdf': 'writer_pdf_Export', 'docx': 'MS Word 2007 XML', 'doc': 'MS Word 97', 'odt': 'writer8', 'rtf': 'Rich Text Format',
               'txt': 'Text (encoded)', 'html': 'HTML (StarWriter)', 'htm': 'HTML (StarWriter)', 'epub': 'EPUB', 'fodt': 'OpenDocument Text Flat XML'},
    'calc': {'pdf': 'calc_pdf_Export', 'xlsx': 'Calc MS Excel 2007 XML', 'xls': 'MS Excel 97', 'ods': 'calc8', 'csv': 'Text - txt - csv (StarCalc)',
             'html': 'HTML (StarCalc)', 'htm': 'HTML (StarCalc)', 'fods': 'OpenDocument Spreadsheet Flat XML'},
    'impress': {'pdf': 'impress_pdf_Export', 'pptx': 'Impress MS PowerPoint 2007 XML', 'ppt': 'MS PowerPoint 97', 'odp': 'impress8',
                'png': 'impress_png_Export', 'jpg': 'impress_jpg_Export', 'html': 'impress_html_Export', 'fodp': 'OpenDocument Presentation Flat XML'},
    'draw': {'pdf': 'draw_pdf_Export', 'odg': 'draw8', 'png': 'draw_png_Export', 'jpg': 'draw_jpg_Export', 'svg': 'draw_svg_Export'},
}
OPTIONS = {'Text (encoded)': 'UTF8', 'Text - txt - csv (StarCalc)': '44,34,76,1'}


def prop(name, value):
    p = PropertyValue()
    p.Name = name
    p.Value = value
    return p


def url_of(p):
    return uno.systemPathToFileUrl(os.path.abspath(p))


def say(obj):
    out = json.dumps(obj)
    sys.stdout.write(out + '\n')
    sys.stdout.flush()


class Office(object):
    def __init__(self):
        self.proc = None
        self.desktop = None

    def start(self):
        pipe = 'bob_office_%d' % os.getpid()
        profile = url_of(PROFILE)
        args = [SOFFICE, '--headless', '--invisible', '--nologo', '--norestore', '--nodefault', '--nolockcheck',
                '-env:UserInstallation=' + profile, '--accept=pipe,name=%s;urp;StarOffice.ComponentContext' % pipe]
        kw = {}
        if os.name == 'nt':
            kw['creationflags'] = 0x08000000  # no console window
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kw)
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        last = None
        # The first start makes the profile and can take a while on a slow disk.
        for _ in range(240):
            try:
                ctx = resolver.resolve('uno:pipe,name=%s;urp;StarOffice.ComponentContext' % pipe)
                self.desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
                self.ctx = ctx
                return
            except Exception as e:  # not listening yet
                last = e
                if self.proc.poll() is not None:
                    raise RuntimeError('LibreOffice closed straight away (code %s).' % self.proc.returncode)
                time.sleep(0.25)
        raise RuntimeError('LibreOffice did not start in time (%s).' % last)

    def stop(self):
        try:
            if self.desktop is not None:
                self.desktop.terminate()
        except Exception:
            pass
        if self.proc is not None:
            for _ in range(40):
                if self.proc.poll() is not None:
                    return
                time.sleep(0.25)
            try:
                self.proc.kill()
            except Exception:
                pass

    def open(self, path, hidden=True):
        if not os.path.exists(path):
            raise RuntimeError('There is no file at %s.' % path)
        props = [prop('Hidden', hidden), prop('ReadOnly', False),
                 prop('MacroExecutionMode', 0),  # never run macros in the document
                 prop('UpdateDocMode', 0)]       # never refresh links to other files or the web
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        if ext in ('csv', 'tsv'):
            props.append(prop('FilterName', 'Text - txt - csv (StarCalc)'))
            props.append(prop('FilterOptions', '9,34,76,1' if ext == 'tsv' else '44,34,76,1'))
        doc = self.desktop.loadComponentFromURL(url_of(path), '_blank', 0, tuple(props))
        if doc is None:
            raise RuntimeError('LibreOffice could not open %s. It may be damaged or a kind of file it does not know.' % os.path.basename(path))
        return doc

    def new(self, kind):
        what = {'writer': 'private:factory/swriter', 'calc': 'private:factory/scalc', 'impress': 'private:factory/simpress', 'draw': 'private:factory/sdraw'}[kind]
        return self.desktop.loadComponentFromURL(what, '_blank', 0, (prop('Hidden', True),))


def kind_of(doc):
    if doc.supportsService('com.sun.star.sheet.SpreadsheetDocument'):
        return 'calc'
    if doc.supportsService('com.sun.star.presentation.PresentationDocument'):
        return 'impress'
    if doc.supportsService('com.sun.star.drawing.DrawingDocument'):
        return 'draw'
    if doc.supportsService('com.sun.star.text.TextDocument') or doc.supportsService('com.sun.star.text.WebDocument'):
        return 'writer'
    return 'unknown'


def save(doc, out, overwrite=False):
    kind = kind_of(doc)
    ext = os.path.splitext(out)[1].lower().lstrip('.')
    flt = FILTERS.get(kind, {}).get(ext)
    if not flt:
        can = ', '.join(sorted(FILTERS.get(kind, {}).keys()))
        raise RuntimeError('A %s document can\'t be saved as .%s. It can be: %s.' % (NAMES.get(kind, kind), ext, can))
    if os.path.exists(out) and not overwrite:
        raise RuntimeError('%s already exists, and I don\'t overwrite.' % out)
    props = [prop('FilterName', flt), prop('Overwrite', bool(overwrite))]
    if flt in OPTIONS:
        props.append(prop('FilterOptions', OPTIONS[flt]))
    doc.storeToURL(url_of(out), tuple(props))
    if not os.path.exists(out):
        raise RuntimeError('LibreOffice said it saved %s, but the file is not there.' % out)
    return {'out': out, 'kind': kind, 'bytes': os.path.getsize(out)}


NAMES = {'writer': 'text', 'calc': 'spreadsheet', 'impress': 'presentation', 'draw': 'drawing', 'unknown': 'unknown'}


# ---------------- reading ----------------

def col_name(n):
    s = ''
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def cell_text(v):
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    try:
        return unicode(v)  # noqa: F821 (Python 2)
    except NameError:
        return str(v)


def read_writer(doc, limit):
    out, n = [], 0
    en = doc.getText().createEnumeration()
    while en.hasMoreElements():
        el = en.nextElement()
        if el.supportsService('com.sun.star.text.TextTable'):
            rows = el.getDataArray() if hasattr(el, 'getDataArray') else ()
            if not rows:
                names = el.getCellNames()
                out.append('[table with %d cells]' % len(names))
                continue
            for i, row in enumerate(rows):
                out.append('| ' + ' | '.join(cell_text(c).replace('\n', ' ') for c in row) + ' |')
                if i == 0:
                    out.append('|' + '---|' * len(row))
            out.append('')
        else:
            text = el.getString()
            style = ''
            try:
                style = el.ParaStyleName or ''
            except Exception:
                pass
            m = re.match(r'Heading\s*(\d)', style)
            if m and text.strip():
                text = '#' * int(m.group(1)) + ' ' + text
            elif style.startswith('Title') and text.strip():
                text = '# ' + text
            else:
                try:
                    if el.NumberingIsNumber and text.strip():
                        text = '- ' + text
                except Exception:
                    pass
            out.append(text)
        n += 1
        if sum(len(x) for x in out) > limit:
            break
    pages = None
    try:
        pages = doc.getCurrentController().PageCount
    except Exception:
        pass
    return '\n'.join(out), {'paragraphs': n, 'pages': pages}


def used_area(sheet):
    cur = sheet.createCursor()
    cur.gotoEndOfUsedArea(False)
    a = cur.getRangeAddress()
    return a.EndColumn, a.EndRow


def read_calc(doc, limit, only, formulas):
    sheets = doc.getSheets()
    out, info = [], []
    for name in sheets.getElementNames():
        if only and name.lower() != only.lower():
            continue
        sh = sheets.getByName(name)
        ec, er = used_area(sh)
        info.append({'name': name, 'columns': ec + 1, 'rows': er + 1, 'area': 'A1:%s%d' % (col_name(ec), er + 1)})
        out.append('## Sheet: %s (A1:%s%d)' % (name, col_name(ec), er + 1))
        rng = sh.getCellRangeByPosition(0, 0, ec, min(er, 5000))
        data = rng.getFormulaArray() if formulas else rng.getDataArray()
        for i, row in enumerate(data):
            out.append('%d: ' % (i + 1) + ' | '.join(cell_text(c) for c in row))
            if sum(len(x) for x in out) > limit:
                break
        out.append('')
    if only and not info:
        raise RuntimeError('There is no sheet called %s. Sheets: %s.' % (only, ', '.join(sheets.getElementNames())))
    return '\n'.join(out), {'sheets': info}


def shape_texts(page):
    texts = []
    for i in range(page.getCount()):
        sh = page.getByIndex(i)
        try:
            t = sh.getString()
        except Exception:
            t = ''
        if t and t.strip():
            texts.append(t)
    return texts


def read_impress(doc, limit):
    pages = doc.getDrawPages()
    out = []
    for i in range(pages.getCount()):
        pg = pages.getByIndex(i)
        out.append('## Slide %d' % (i + 1))
        out.extend(shape_texts(pg))
        try:
            notes = [t for t in shape_texts(pg.getNotesPage()) if t.strip()]
            if notes:
                out.append('(Notes: %s)' % ' / '.join(notes[1:] if len(notes) > 1 else notes))
        except Exception:
            pass
        out.append('')
        if sum(len(x) for x in out) > limit:
            break
    return '\n'.join(out), {'slides': pages.getCount()}


def do_read(office, job):
    doc = office.open(job['src'])
    try:
        kind = kind_of(doc)
        limit = int(job.get('max') or 20000)
        if kind == 'writer':
            text, info = read_writer(doc, limit)
        elif kind == 'calc':
            text, info = read_calc(doc, limit, job.get('sheet') or '', bool(job.get('formulas')))
        elif kind in ('impress', 'draw'):
            text, info = read_impress(doc, limit)
        else:
            raise RuntimeError('I can open that file but I don\'t know how to read it.')
        cut = len(text) > limit
        return {'kind': kind, 'text': text[:limit], 'cut': cut, 'chars': len(text), 'info': info}
    finally:
        doc.close(True)


# ---------------- writing ----------------

BOLD = re.compile(r'\*\*(.+?)\*\*')


def put_text(text, cursor, line):
    # **bold** pieces in a line; everything else plain.
    pos = 0
    for m in BOLD.finditer(line):
        if m.start() > pos:
            cursor.CharWeight = 100.0
            text.insertString(cursor, line[pos:m.start()], False)
        cursor.CharWeight = 150.0
        text.insertString(cursor, m.group(1), False)
        pos = m.end()
    cursor.CharWeight = 100.0
    text.insertString(cursor, line[pos:], False)


def set_style(cursor, name, fallback='Standard'):
    for n in (name, fallback):
        try:
            cursor.ParaStyleName = n
            return True
        except Exception:
            continue
    return False


def table_rows(lines):
    rows = []
    for ln in lines:
        cells = [c.strip() for c in ln.strip().strip('|').split('|')]
        if all(re.match(r'^:?-{2,}:?$', c) for c in cells if c):
            continue
        rows.append(cells)
    return rows


def write_markdown(doc, md):
    # Plain text with a little Markdown: # headings, - bullets, 1. numbers, | tables |, **bold**, and a line
    # with just "---page---" for a page break.
    text = doc.getText()
    cursor = text.createTextCursorByRange(text.getEnd())
    from com.sun.star.text.ControlCharacter import PARAGRAPH_BREAK
    lines = md.replace('\r\n', '\n').split('\n')
    first = not text.getString()
    i = 0
    count = {'paragraphs': 0, 'tables': 0}

    def new_para():
        if not new_para.first:
            text.insertControlCharacter(cursor, PARAGRAPH_BREAK, False)
        new_para.first = False
    new_para.first = first

    while i < len(lines):
        ln = lines[i]
        if ln.strip().startswith('|'):
            block = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                block.append(lines[i])
                i += 1
            rows = table_rows(block)
            if rows:
                new_para()
                set_style(cursor, 'Standard')
                cols = max(len(r) for r in rows)
                tbl = doc.createInstance('com.sun.star.text.TextTable')
                tbl.initialize(len(rows), cols)
                text.insertTextContent(cursor, tbl, False)
                for r, row in enumerate(rows):
                    for c in range(cols):
                        cell = tbl.getCellByName(col_name(c) + str(r + 1))
                        val = row[c] if c < len(row) else ''
                        cell.setString(BOLD.sub(r'\1', val))
                count['tables'] += 1
                new_para.first = False
            continue
        new_para()
        m = re.match(r'^(#{1,6})\s+(.*)$', ln)
        b = re.match(r'^\s*[-*\u2022]\s+(.*)$', ln)
        if ln.strip() == '---page---':
            from com.sun.star.style.BreakType import PAGE_BEFORE
            set_style(cursor, 'Standard')
            cursor.BreakType = PAGE_BEFORE
        elif m:
            set_style(cursor, 'Heading %d' % len(m.group(1)), 'Heading')
            put_text(text, cursor, m.group(2))
        elif b:
            if not set_style(cursor, 'List Bullet', None) or cursor.ParaStyleName != 'List Bullet':
                set_style(cursor, 'Standard')
                try:
                    cursor.NumberingStyleName = 'List 1'
                    put_text(text, cursor, b.group(1))
                except Exception:
                    put_text(text, cursor, u'\u2022 ' + b.group(1))
            else:
                put_text(text, cursor, b.group(1))
        else:
            set_style(cursor, 'Standard')
            try:
                cursor.NumberingStyleName = ''
            except Exception:
                pass
            put_text(text, cursor, ln)
        if ln.strip():
            count['paragraphs'] += 1
        i += 1
    return count


def cell_ref(ref):
    m = re.match(r'^\s*([A-Za-z]{1,3})(\d{1,7})\s*$', str(ref))
    if not m:
        raise RuntimeError('%s isn\'t a cell name like B2.' % ref)
    col = 0
    for ch in m.group(1).upper():
        col = col * 26 + (ord(ch) - 64)
    return col - 1, int(m.group(2)) - 1


def put_cell(cell, v):
    if v is None:
        cell.setString('')
    elif isinstance(v, bool):
        cell.setValue(1 if v else 0)
    elif isinstance(v, (int, float)):
        cell.setValue(v)
    else:
        s = cell_text(v) if not isinstance(v, str) else v
        if s.startswith('='):
            cell.setFormula(s)
        elif re.match(r'^-?\d+(\.\d+)?$', s) and not (len(s) > 1 and s.startswith('0') and not s.startswith('0.')):
            cell.setValue(float(s))
        else:
            cell.setString(s)


def fill_sheet(sh, rows, header=True, start_row=0):
    width = 0
    for r, row in enumerate(rows or []):
        row = row if isinstance(row, (list, tuple)) else [row]
        width = max(width, len(row))
        for c, v in enumerate(row):
            put_cell(sh.getCellByPosition(c, start_row + r), v)
    if header and rows and start_row == 0 and width:
        rng = sh.getCellRangeByPosition(0, 0, width - 1, 0)
        rng.CharWeight = 150.0
    if width:
        cols = sh.getColumns()
        for c in range(width):
            try:
                cols.getByIndex(c).OptimalWidth = True
            except Exception:
                pass
    return len(rows or [])


def make_calc(doc, sheets):
    allsh = doc.getSheets()
    first = allsh.getElementNames()[0]
    total = 0
    for i, s in enumerate(sheets or [{'name': 'Sheet1', 'rows': []}]):
        name = (s.get('name') or 'Sheet%d' % (i + 1))[:31]
        if i == 0:
            sh = allsh.getByName(first)
            sh.setName(name)
        else:
            allsh.insertNewByName(name, i)
            sh = allsh.getByName(name)
        total += fill_sheet(sh, s.get('rows') or [], s.get('header', True) is not False)
    doc.calculateAll()
    return {'sheets': len(sheets or []), 'rows': total}


def fill_slide(doc, page, slide, index):
    title = slide.get('title') or ''
    bullets = slide.get('bullets') or []
    if isinstance(bullets, str):
        bullets = [b for b in bullets.split('\n') if b.strip()]
    try:
        page.Layout = 0 if (index == 0 and not bullets) else 1  # 0 = title slide, 1 = title and content
    except Exception:
        pass
    title_done = body_done = False
    for i in range(page.getCount()):
        sh = page.getByIndex(i)
        t = sh.getShapeType()
        if t.endswith('TitleTextShape') and not title_done:
            sh.setString(title)
            title_done = True
        elif (t.endswith('OutlinerShape') or t.endswith('SubTitleShape')) and not body_done:
            sh.setString('\n'.join(re.sub(r'^\s*[-*\u2022]\s+', '', b) for b in bullets))
            body_done = True
    # A layout that didn't give us boxes: add our own.
    if not title_done and title:
        box = doc.createInstance('com.sun.star.drawing.TextShape')
        page.add(box)
        from com.sun.star.awt import Point, Size
        box.setPosition(Point(1000, 1000))
        box.setSize(Size(24000, 2500))
        box.setString(title)
        box.CharHeight = 32
    if not body_done and bullets:
        box = doc.createInstance('com.sun.star.drawing.TextShape')
        page.add(box)
        from com.sun.star.awt import Point, Size
        box.setPosition(Point(1000, 4000))
        box.setSize(Size(24000, 12000))
        box.setString('\n'.join(u'\u2022 ' + re.sub(r'^\s*[-*\u2022]\s+', '', b) for b in bullets))
    if slide.get('notes'):
        try:
            np = page.getNotesPage()
            for i in range(np.getCount()):
                sh = np.getByIndex(i)
                if sh.getShapeType().endswith('NotesShape'):
                    sh.setString(slide['notes'])
                    break
        except Exception:
            pass


def make_impress(doc, slides):
    slides = slides or [{'title': ''}]
    pages = doc.getDrawPages()
    fill_slide(doc, pages.getByIndex(0), slides[0], 0)
    for n, s in enumerate(slides[1:]):
        pages.insertNewByIndex(n)
        fill_slide(doc, pages.getByIndex(n + 1), s, n + 1)
    return {'slides': pages.getCount()}


def do_make(office, job):
    kind = job.get('kind')
    if kind not in ('writer', 'calc', 'impress'):
        raise RuntimeError('kind must be writer, calc or impress.')
    doc = office.new(kind)
    try:
        if kind == 'writer':
            info = write_markdown(doc, job.get('text') or '')
        elif kind == 'calc':
            info = make_calc(doc, job.get('sheets'))
        else:
            info = make_impress(doc, job.get('slides'))
        res = save(doc, job['out'])
        res['info'] = info
        return res
    finally:
        doc.close(True)


def replace_all(target, find, repl, case=False):
    rd = target.createReplaceDescriptor()
    rd.SearchString = find
    rd.ReplaceString = repl
    rd.SearchCaseSensitive = bool(case)
    return target.replaceAll(rd)


def sheet_of(doc, name):
    sheets = doc.getSheets()
    if not name:
        return sheets.getByIndex(0)
    for n in sheets.getElementNames():
        if n.lower() == str(name).lower():
            return sheets.getByName(n)
    raise RuntimeError('There is no sheet called %s. Sheets: %s.' % (name, ', '.join(sheets.getElementNames())))


def do_edit(office, job):
    src = job['src']
    doc = office.open(src)
    try:
        kind = kind_of(doc)
        done = []
        for ch in job.get('changes') or []:
            op = ch.get('op')
            if op == 'replace':
                n = 0
                if kind == 'calc':
                    sheets = doc.getSheets()
                    for i in range(sheets.getCount()):
                        n += replace_all(sheets.getByIndex(i), ch.get('find', ''), ch.get('replace', ''), ch.get('case'))
                elif kind in ('impress', 'draw'):
                    pages = doc.getDrawPages()
                    for i in range(pages.getCount()):
                        pg = pages.getByIndex(i)
                        try:
                            n += replace_all(pg, ch.get('find', ''), ch.get('replace', ''), ch.get('case'))
                        except Exception:
                            for j in range(pg.getCount()):
                                sh = pg.getByIndex(j)
                                try:
                                    s = sh.getString()
                                except Exception:
                                    continue
                                if ch.get('find') and ch['find'] in s:
                                    n += s.count(ch['find'])
                                    sh.setString(s.replace(ch['find'], ch.get('replace', '')))
                else:
                    n = replace_all(doc, ch.get('find', ''), ch.get('replace', ''), ch.get('case'))
                done.append('replaced "%s" %d time%s' % (ch.get('find', ''), n, '' if n == 1 else 's'))
            elif op == 'append' and kind == 'writer':
                c = write_markdown(doc, ch.get('text') or '')
                done.append('added %d paragraph%s' % (c['paragraphs'], '' if c['paragraphs'] == 1 else 's'))
            elif op == 'set_cells' and kind == 'calc':
                sh = sheet_of(doc, ch.get('sheet'))
                cells = ch.get('cells') or {}
                for ref in cells:
                    c, r = cell_ref(ref)
                    put_cell(sh.getCellByPosition(c, r), cells[ref])
                done.append('set %d cell%s on %s' % (len(cells), '' if len(cells) == 1 else 's', sh.getName()))
            elif op == 'add_rows' and kind == 'calc':
                sh = sheet_of(doc, ch.get('sheet'))
                ec, er = used_area(sh)
                empty = er == 0 and not sh.getCellByPosition(0, 0).getString() and sh.getCellByPosition(0, 0).getValue() == 0
                n = fill_sheet(sh, ch.get('rows') or [], False, 0 if empty else er + 1)
                done.append('added %d row%s to %s' % (n, '' if n == 1 else 's', sh.getName()))
            elif op == 'add_sheet' and kind == 'calc':
                sheets = doc.getSheets()
                name = (ch.get('name') or 'Sheet%d' % (sheets.getCount() + 1))[:31]
                if sheets.hasByName(name):
                    raise RuntimeError('There is already a sheet called %s.' % name)
                sheets.insertNewByName(name, sheets.getCount())
                fill_sheet(sheets.getByName(name), ch.get('rows') or [], True)
                done.append('added sheet %s' % name)
            elif op == 'add_slide' and kind == 'impress':
                pages = doc.getDrawPages()
                count = pages.getCount()
                # "at" = the new slide's number (2 or more; the first slide stays first). Left out: at the end.
                at = int(ch.get('at') or count + 1)
                at = max(2, min(at, count + 1))
                pages.insertNewByIndex(at - 2)  # the new slide goes after this one
                fill_slide(doc, pages.getByIndex(at - 1), ch, at - 1)
                done.append('added slide %d' % at)
            elif op == 'delete_slide' and kind == 'impress':
                pages = doc.getDrawPages()
                n = int(ch.get('number') or 0)
                if n < 1 or n > pages.getCount():
                    raise RuntimeError('There is no slide %s (there are %d).' % (ch.get('number'), pages.getCount()))
                if pages.getCount() == 1:
                    raise RuntimeError('That is the only slide, so I left it.')
                pages.remove(pages.getByIndex(n - 1))
                done.append('removed slide %d' % n)
            else:
                raise RuntimeError('"%s" doesn\'t work on a %s document.' % (op, NAMES.get(kind, kind)))
        if kind == 'calc':
            doc.calculateAll()
        out = job.get('out') or src
        res = save(doc, out, overwrite=(out == src))
        res['done'] = done
        return res
    finally:
        doc.close(True)


def do_convert(office, job):
    doc = office.open(job['src'])
    try:
        return save(doc, job['out'])
    finally:
        doc.close(True)


def main():
    raw = sys.stdin.read()
    try:
        job = json.loads(raw)
    except Exception:
        say({'ok': False, 'error': 'Bob sent a job I could not read.'})
        return 2
    office = Office()
    try:
        if job.get('op') == 'info':
            say({'ok': True, 'python': sys.version.split()[0], 'soffice': SOFFICE})
            return 0
        office.start()
        fn = {'convert': do_convert, 'read': do_read, 'make': do_make, 'edit': do_edit}.get(job.get('op'))
        if not fn:
            raise RuntimeError('Unknown job %s.' % job.get('op'))
        res = fn(office, job)
        res['ok'] = True
        say(res)
        return 0
    except Exception as e:
        say({'ok': False, 'error': str(e) or e.__class__.__name__})
        return 1
    finally:
        office.stop()


if __name__ == '__main__':
    sys.exit(main())
