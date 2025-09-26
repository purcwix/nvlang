#include <napi.h>
#include <ncurses.h>
#include <string>
#include <map>

std::map<int, WINDOW*> windowMap;
int nextWinId = 1;

// ---------- Core ----------
Napi::Value initscrWrapped(const Napi::CallbackInfo& info) {
    initscr();
    cbreak();
    noecho();
    keypad(stdscr, TRUE);
    curs_set(0);
    return info.Env().Undefined();
}

Napi::Value endwinWrapped(const Napi::CallbackInfo& info) { endwin(); return info.Env().Undefined(); }
Napi::Value refreshWrapped(const Napi::CallbackInfo& info) { refresh(); return info.Env().Undefined(); }
Napi::Value clearWrapped(const Napi::CallbackInfo& info) { clear(); return info.Env().Undefined(); }
Napi::Value getchWrapped(const Napi::CallbackInfo& info) { return Napi::Number::New(info.Env(), getch()); }

Napi::Value printwWrapped(const Napi::CallbackInfo& info) {
    std::string text = info[0].As<Napi::String>();
    printw("%s", text.c_str());
    return info.Env().Undefined();
}

// ---------- Colors ----------
Napi::Value start_colorWrapped(const Napi::CallbackInfo& info) { start_color(); return info.Env().Undefined(); }
Napi::Value init_pairWrapped(const Napi::CallbackInfo& info) {
    short pair = info[0].As<Napi::Number>().Int32Value();
    short fg   = info[1].As<Napi::Number>().Int32Value();
    short bg   = info[2].As<Napi::Number>().Int32Value();
    init_pair(pair, fg, bg);
    return info.Env().Undefined();
}

Napi::Value attronWrapped(const Napi::CallbackInfo& info) { attron(info[0].As<Napi::Number>()); return info.Env().Undefined(); }
Napi::Value attroffWrapped(const Napi::CallbackInfo& info) { attroff(info[0].As<Napi::Number>()); return info.Env().Undefined(); }

// ---------- Windows ----------
Napi::Value newwinWrapped(const Napi::CallbackInfo& info) {
    int h = info[0].As<Napi::Number>().Int32Value();
    int w = info[1].As<Napi::Number>().Int32Value();
    int y = info[2].As<Napi::Number>().Int32Value();
    int x = info[3].As<Napi::Number>().Int32Value();

    WINDOW* win = newwin(h, w, y, x);
    int winId = nextWinId++;
    windowMap[winId] = win;

    return Napi::Number::New(info.Env(), winId);
}

Napi::Value delwinWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) {
        delwin(it->second);
        windowMap.erase(it);
    }
    return info.Env().Undefined();
}

Napi::Value wrefreshWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) {
        wrefresh(it->second);
    }
    return info.Env().Undefined();
}

// ---------- Pads ----------
Napi::Value newpadWrapped(const Napi::CallbackInfo& info) {
    int h = info[0].As<Napi::Number>().Int32Value();
    int w = info[1].As<Napi::Number>().Int32Value();
    WINDOW* pad = newpad(h, w);
    return Napi::External<WINDOW>::New(info.Env(), pad);
}

Napi::Value prefreshWrapped(const Napi::CallbackInfo& info) {
    WINDOW* pad = info[0].As<Napi::External<WINDOW>>().Data();
    int pminrow = info[1].As<Napi::Number>().Int32Value();
    int pmincol = info[2].As<Napi::Number>().Int32Value();
    int sminrow = info[3].As<Napi::Number>().Int32Value();
    int smincol = info[4].As<Napi::Number>().Int32Value();
    int smaxrow = info[5].As<Napi::Number>().Int32Value();
    int smaxcol = info[6].As<Napi::Number>().Int32Value();
    prefresh(pad, pminrow, pmincol, sminrow, smincol, smaxrow, smaxcol);
    return info.Env().Undefined();
}

// ---------- Mouse ----------
Napi::Value mousemaskWrapped(const Napi::CallbackInfo& info) {
    mousemask(static_cast<mmask_t>(info[0].As<Napi::Number>().Int64Value()), nullptr);
    return info.Env().Undefined();
}

Napi::Value getmouseWrapped(const Napi::CallbackInfo& info) {
    MEVENT ev;
    if (getmouse(&ev) == OK) {
        Napi::Object obj = Napi::Object::New(info.Env());
        obj.Set("x", ev.x);
        obj.Set("y", ev.y);
        obj.Set("bstate", (int)ev.bstate);
        return obj;
    }
    return info.Env().Null();
}

// ---------- Attributes ----------
Napi::Value wattronWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int attr  = info[1].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wattron(it->second, attr);
    return info.Env().Undefined();
}

Napi::Value wattroffWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int attr  = info[1].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wattroff(it->second, attr);
    return info.Env().Undefined();
}

// ---------- Softkeys ----------
Napi::Value slk_initWrapped(const Napi::CallbackInfo& info) { slk_init(info[0].As<Napi::Number>()); return info.Env().Undefined(); }
Napi::Value slk_setWrapped(const Napi::CallbackInfo& info) {
    slk_set(info[0].As<Napi::Number>(), info[1].As<Napi::String>().Utf8Value().c_str(), info[2].As<Napi::Number>());
    return info.Env().Undefined();
}
Napi::Value slk_refreshWrapped(const Napi::CallbackInfo& info) { slk_refresh(); return info.Env().Undefined(); }

// ---------- Resize ----------
Napi::Value resizetermWrapped(const Napi::CallbackInfo& info) {
    resizeterm(info[0].As<Napi::Number>(), info[1].As<Napi::Number>());
    return info.Env().Undefined();
}
Napi::Value is_term_resizedWrapped(const Napi::CallbackInfo& info) {
    bool resized = is_term_resized(info[0].As<Napi::Number>(), info[1].As<Napi::Number>());
    return Napi::Boolean::New(info.Env(), resized);
}

// ---------- Window Printing ----------
Napi::Value wprintwWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    std::string text = info[1].As<Napi::String>();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wprintw(it->second, "%s", text.c_str());
    return info.Env().Undefined();
}

Napi::Value mvprintwWrapped(const Napi::CallbackInfo& info) {
    int y = info[0].As<Napi::Number>().Int32Value();
    int x = info[1].As<Napi::Number>().Int32Value();
    std::string text = info[2].As<Napi::String>();
    mvprintw(y, x, "%s", text.c_str());
    return info.Env().Undefined();
}

Napi::Value mvwprintwWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int x = info[2].As<Napi::Number>().Int32Value();
    std::string text = info[3].As<Napi::String>();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) mvwprintw(it->second, y, x, "%s", text.c_str());
    return info.Env().Undefined();
}

// ---------- Borders ----------
Napi::Value boxWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int verch = info[1].As<Napi::Number>().Int32Value();
    int horch = info[2].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) box(it->second, verch, horch);
    return info.Env().Undefined();
}

// ---------- Input ----------
Napi::Value nodelayWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    bool flag = info[1].As<Napi::Boolean>();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) nodelay(it->second, flag ? TRUE : FALSE);
    return info.Env().Undefined();
}

Napi::Value wgetchWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) return Napi::Number::New(info.Env(), wgetch(it->second));
	return Napi::Number::New(info.Env(), -1);
}

// ---------- Window Movement ----------
Napi::Value wmoveWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int y = info[1].As<Napi::Number>().Int32Value();
    int x = info[2].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wmove(it->second, y, x);
    return info.Env().Undefined();
}

// ---------- Clearing & Scrolling ----------
Napi::Value wclearWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wclear(it->second);
    return info.Env().Undefined();
}

Napi::Value wclrtoeolWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wclrtoeol(it->second);
    return info.Env().Undefined();
}

Napi::Value scrollWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int n = info[1].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) scrl(n);
    return info.Env().Undefined();
}

Napi::Value scrollokWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    bool flag = info[1].As<Napi::Boolean>();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) scrollok(it->second, flag ? TRUE : FALSE);
    return info.Env().Undefined();
}

// ---------- Subwindows ----------
Napi::Value subwinWrapped(const Napi::CallbackInfo& info) {
    int parentId = info[0].As<Napi::Number>().Int32Value();
    int h = info[1].As<Napi::Number>().Int32Value();
    int w = info[2].As<Napi::Number>().Int32Value();
    int y = info[3].As<Napi::Number>().Int32Value();
    int x = info[4].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(parentId);
    if (it != windowMap.end()) {
        WINDOW* win = subwin(it->second, h, w, y, x);
        int winId = nextWinId++;
        windowMap[winId] = win;
        return Napi::Number::New(info.Env(), winId);
    }
    return info.Env().Null();
}

Napi::Value derwinWrapped(const Napi::CallbackInfo& info) {
    int parentId = info[0].As<Napi::Number>().Int32Value();
    int h = info[1].As<Napi::Number>().Int32Value();
    int w = info[2].As<Napi::Number>().Int32Value();
    int y = info[3].As<Napi::Number>().Int32Value();
    int x = info[4].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(parentId);
    if (it != windowMap.end()) {
        WINDOW* win = derwin(it->second, h, w, y, x);
        int winId = nextWinId++;
        windowMap[winId] = win;
        return Napi::Number::New(info.Env(), winId);
    }
    return info.Env().Null();
}

// ---------- Box & Border Helpers ----------
Napi::Value wborderWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int ls = info[1].As<Napi::Number>().Int32Value();
    int rs = info[2].As<Napi::Number>().Int32Value();
    int ts = info[3].As<Napi::Number>().Int32Value();
    int bs = info[4].As<Napi::Number>().Int32Value();
    int tl = info[5].As<Napi::Number>().Int32Value();
    int tr = info[6].As<Napi::Number>().Int32Value();
    int bl = info[7].As<Napi::Number>().Int32Value();
    int br = info[8].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wborder(it->second, ls, rs, ts, bs, tl, tr, bl, br);
    return info.Env().Undefined();
}

// ---------- Attributes ----------
Napi::Value wattrsetWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int attr = info[1].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) wattrset(it->second, attr);
    return info.Env().Undefined();
}

// ---------- Pads ----------
Napi::Value wpadWrapped(const Napi::CallbackInfo& info) {
    int h = info[0].As<Napi::Number>().Int32Value();
    int w = info[1].As<Napi::Number>().Int32Value();
    WINDOW* pad = newpad(h, w);
    int padId = nextWinId++;
    windowMap[padId] = pad;
    return Napi::Number::New(info.Env(), padId);
}

// ---------- Color ----------
Napi::Value color_setWrapped(const Napi::CallbackInfo& info) {
    int pair = info[0].As<Napi::Number>().Int32Value();
    attr_t old;
    color_set(pair, &old);
    return info.Env().Undefined();
}

// ---------- Wide-char / Unicode ----------
Napi::Value addchWrapped(const Napi::CallbackInfo& info) {
    char ch = info[0].As<Napi::Number>().Int32Value();
    addch(ch);
    return info.Env().Undefined();
}

Napi::Value enableMouseWrapped(const Napi::CallbackInfo& info) {
    mousemask(ALL_MOUSE_EVENTS | REPORT_MOUSE_POSITION, nullptr);
    return info.Env().Undefined();
}

Napi::Value mvaddchWrapped(const Napi::CallbackInfo& info) {
    int y = info[0].As<Napi::Number>().Int32Value();
    int x = info[1].As<Napi::Number>().Int32Value();
    char ch = static_cast<char>(info[2].As<Napi::Number>().Int32Value());
    mvaddch(y, x, ch);
    return info.Env().Undefined();
}

Napi::Value boxDefaultWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) box(it->second, 0, 0);
    return info.Env().Undefined();
}

Napi::Value fullWinWrapped(const Napi::CallbackInfo& info) {
    WINDOW* win = newwin(LINES, COLS, 0, 0);
    int winId = nextWinId++;
    windowMap[winId] = win;
    return Napi::Number::New(info.Env(), winId);
}

Napi::Value nodelayGetchWrapped(const Napi::CallbackInfo& info) {
    int winId = info[0].As<Napi::Number>().Int32Value();
    int ch = -1;
    auto it = windowMap.find(winId);
    if (it != windowMap.end()) {
        nodelay(it->second, TRUE);
        ch = wgetch(it->second);
        nodelay(it->second, FALSE);
    }
    return Napi::Number::New(info.Env(), ch);
}

// ---------- Module Init ----------
Napi::Object Init(Napi::Env env, Napi::Object exports) {
exports.Set("enableMouse", Napi::Function::New(env, enableMouseWrapped));
exports.Set("mvaddch", Napi::Function::New(env, mvaddchWrapped));
exports.Set("boxDefault", Napi::Function::New(env, boxDefaultWrapped));
exports.Set("fullWin", Napi::Function::New(env, fullWinWrapped));
exports.Set("nodelayGetch", Napi::Function::New(env, nodelayGetchWrapped));
exports.Set("color_set", Napi::Function::New(env, color_setWrapped));
// ---------- Pads ----------
exports.Set("newpad", Napi::Function::New(env, wpadWrapped));
exports.Set("addch", Napi::Function::New(env, addchWrapped));
exports.Set("wmove", Napi::Function::New(env, wmoveWrapped));
exports.Set("wclear", Napi::Function::New(env, wclearWrapped));
exports.Set("wclrtoeol", Napi::Function::New(env, wclrtoeolWrapped));
exports.Set("scroll", Napi::Function::New(env, scrollWrapped));
exports.Set("scrollok", Napi::Function::New(env, scrollokWrapped));
exports.Set("subwin", Napi::Function::New(env, subwinWrapped));
exports.Set("derwin", Napi::Function::New(env, derwinWrapped));
exports.Set("wborder", Napi::Function::New(env, wborderWrapped));
exports.Set("wattrset", Napi::Function::New(env, wattrsetWrapped));

exports.Set("wprintw", Napi::Function::New(env, wprintwWrapped));
exports.Set("mvprintw", Napi::Function::New(env, mvprintwWrapped));
exports.Set("mvwprintw", Napi::Function::New(env, mvwprintwWrapped));
exports.Set("box", Napi::Function::New(env, boxWrapped));
exports.Set("nodelay", Napi::Function::New(env, nodelayWrapped));
exports.Set("wgetch", Napi::Function::New(env, wgetchWrapped));
    exports.Set("initscr", Napi::Function::New(env, initscrWrapped));
    exports.Set("endwin", Napi::Function::New(env, endwinWrapped));
    exports.Set("refresh", Napi::Function::New(env, refreshWrapped));
    exports.Set("clear", Napi::Function::New(env, clearWrapped));
    exports.Set("getch", Napi::Function::New(env, getchWrapped));
    exports.Set("printw", Napi::Function::New(env, printwWrapped));

    exports.Set("start_color", Napi::Function::New(env, start_colorWrapped));
    exports.Set("init_pair", Napi::Function::New(env, init_pairWrapped));
    exports.Set("attron", Napi::Function::New(env, attronWrapped));
    exports.Set("attroff", Napi::Function::New(env, attroffWrapped));

    exports.Set("newwin", Napi::Function::New(env, newwinWrapped));
    exports.Set("delwin", Napi::Function::New(env, delwinWrapped));
    exports.Set("wrefresh", Napi::Function::New(env, wrefreshWrapped));

    exports.Set("newpad", Napi::Function::New(env, newpadWrapped));
    exports.Set("prefresh", Napi::Function::New(env, prefreshWrapped));

    exports.Set("mousemask", Napi::Function::New(env, mousemaskWrapped));
    exports.Set("getmouse", Napi::Function::New(env, getmouseWrapped));

    exports.Set("wattron", Napi::Function::New(env, wattronWrapped));
    exports.Set("wattroff", Napi::Function::New(env, wattroffWrapped));

    exports.Set("slk_init", Napi::Function::New(env, slk_initWrapped));
    exports.Set("slk_set", Napi::Function::New(env, slk_setWrapped));
    exports.Set("slk_refresh", Napi::Function::New(env, slk_refreshWrapped));

    exports.Set("resizeterm", Napi::Function::New(env, resizetermWrapped));
    exports.Set("is_term_resized", Napi::Function::New(env, is_term_resizedWrapped));

// ---------- Attributes ----------
exports.Set("A_NORMAL", Napi::Number::New(env, A_NORMAL));
exports.Set("A_STANDOUT", Napi::Number::New(env, A_STANDOUT));
exports.Set("A_UNDERLINE", Napi::Number::New(env, A_UNDERLINE));
exports.Set("A_REVERSE", Napi::Number::New(env, A_REVERSE));
exports.Set("A_BLINK", Napi::Number::New(env, A_BLINK));
exports.Set("A_DIM", Napi::Number::New(env, A_DIM));
exports.Set("A_BOLD", Napi::Number::New(env, A_BOLD));
exports.Set("A_PROTECT", Napi::Number::New(env, A_PROTECT));
exports.Set("A_INVIS", Napi::Number::New(env, A_INVIS));
exports.Set("A_ALTCHARSET", Napi::Number::New(env, A_ALTCHARSET));
exports.Set("A_CHARTEXT", Napi::Number::New(env, A_CHARTEXT));
exports.Set("A_HORIZONTAL", Napi::Number::New(env, A_HORIZONTAL));
exports.Set("A_LEFT", Napi::Number::New(env, A_LEFT));
exports.Set("A_LOW", Napi::Number::New(env, A_LOW));
exports.Set("A_RIGHT", Napi::Number::New(env, A_RIGHT));
exports.Set("A_TOP", Napi::Number::New(env, A_TOP));
exports.Set("A_VERTICAL", Napi::Number::New(env, A_VERTICAL));

// ---------- Colors ----------
exports.Set("COLOR_BLACK", Napi::Number::New(env, COLOR_BLACK));
exports.Set("COLOR_RED", Napi::Number::New(env, COLOR_RED));
exports.Set("COLOR_GREEN", Napi::Number::New(env, COLOR_GREEN));
exports.Set("COLOR_YELLOW", Napi::Number::New(env, COLOR_YELLOW));
exports.Set("COLOR_BLUE", Napi::Number::New(env, COLOR_BLUE));
exports.Set("COLOR_MAGENTA", Napi::Number::New(env, COLOR_MAGENTA));
exports.Set("COLOR_CYAN", Napi::Number::New(env, COLOR_CYAN));
exports.Set("COLOR_WHITE", Napi::Number::New(env, COLOR_WHITE));

// ---------- Special keys ----------
exports.Set("KEY_BREAK", Napi::Number::New(env, KEY_BREAK));
exports.Set("KEY_DOWN", Napi::Number::New(env, KEY_DOWN));
exports.Set("KEY_UP", Napi::Number::New(env, KEY_UP));
exports.Set("KEY_LEFT", Napi::Number::New(env, KEY_LEFT));
exports.Set("KEY_RIGHT", Napi::Number::New(env, KEY_RIGHT));
exports.Set("KEY_HOME", Napi::Number::New(env, KEY_HOME));
exports.Set("KEY_BACKSPACE", Napi::Number::New(env, KEY_BACKSPACE));
exports.Set("KEY_F0", Napi::Number::New(env, KEY_F0)); // base for function keys
for(int i=1;i<=64;i++){
    exports.Set("KEY_F" + std::to_string(i), Napi::Number::New(env, KEY_F0+i));
}
exports.Set("KEY_DC", Napi::Number::New(env, KEY_DC));
exports.Set("KEY_IC", Napi::Number::New(env, KEY_IC));
exports.Set("KEY_NPAGE", Napi::Number::New(env, KEY_NPAGE));
exports.Set("KEY_PPAGE", Napi::Number::New(env, KEY_PPAGE));
exports.Set("KEY_END", Napi::Number::New(env, KEY_END));
exports.Set("KEY_BTAB", Napi::Number::New(env, KEY_BTAB));
exports.Set("KEY_ENTER", Napi::Number::New(env, KEY_ENTER));
exports.Set("KEY_PRINT", Napi::Number::New(env, KEY_PRINT));
exports.Set("KEY_SRESET", Napi::Number::New(env, KEY_SRESET));
exports.Set("KEY_RESET", Napi::Number::New(env, KEY_RESET));
exports.Set("KEY_RESIZE", Napi::Number::New(env, KEY_RESIZE));
exports.Set("KEY_MOUSE", Napi::Number::New(env, KEY_MOUSE));

// ---------- ACS (Alternate Character Set) ----------
exports.Set("ACS_ULCORNER", Napi::Number::New(env, ACS_ULCORNER));
exports.Set("ACS_LLCORNER", Napi::Number::New(env, ACS_LLCORNER));
exports.Set("ACS_URCORNER", Napi::Number::New(env, ACS_URCORNER));
exports.Set("ACS_LRCORNER", Napi::Number::New(env, ACS_LRCORNER));
exports.Set("ACS_HLINE", Napi::Number::New(env, ACS_HLINE));
exports.Set("ACS_VLINE", Napi::Number::New(env, ACS_VLINE));
exports.Set("ACS_PLUS", Napi::Number::New(env, ACS_PLUS));
exports.Set("ACS_TTEE", Napi::Number::New(env, ACS_TTEE));
exports.Set("ACS_BTEE", Napi::Number::New(env, ACS_BTEE));
exports.Set("ACS_LTEE", Napi::Number::New(env, ACS_LTEE));
exports.Set("ACS_RTEE", Napi::Number::New(env, ACS_RTEE));
exports.Set("ACS_BLOCK", Napi::Number::New(env, ACS_BLOCK));
exports.Set("ACS_CKBOARD", Napi::Number::New(env, ACS_CKBOARD));
exports.Set("ACS_DEGREE", Napi::Number::New(env, ACS_DEGREE));
exports.Set("ACS_PLMINUS", Napi::Number::New(env, ACS_PLMINUS));

// ---------- Mouse buttons ----------
exports.Set("BUTTON1_PRESSED", Napi::Number::New(env, BUTTON1_PRESSED));
exports.Set("BUTTON1_RELEASED", Napi::Number::New(env, BUTTON1_RELEASED));
exports.Set("BUTTON1_CLICKED", Napi::Number::New(env, BUTTON1_CLICKED));
exports.Set("BUTTON1_DOUBLE_CLICKED", Napi::Number::New(env, BUTTON1_DOUBLE_CLICKED));
exports.Set("BUTTON1_TRIPLE_CLICKED", Napi::Number::New(env, BUTTON1_TRIPLE_CLICKED));

exports.Set("BUTTON2_PRESSED", Napi::Number::New(env, BUTTON2_PRESSED));
exports.Set("BUTTON2_RELEASED", Napi::Number::New(env, BUTTON2_RELEASED));
exports.Set("BUTTON2_CLICKED", Napi::Number::New(env, BUTTON2_CLICKED));
exports.Set("BUTTON2_DOUBLE_CLICKED", Napi::Number::New(env, BUTTON2_DOUBLE_CLICKED));
exports.Set("BUTTON2_TRIPLE_CLICKED", Napi::Number::New(env, BUTTON2_TRIPLE_CLICKED));

exports.Set("BUTTON3_PRESSED", Napi::Number::New(env, BUTTON3_PRESSED));
exports.Set("BUTTON3_RELEASED", Napi::Number::New(env, BUTTON3_RELEASED));
exports.Set("BUTTON3_CLICKED", Napi::Number::New(env, BUTTON3_CLICKED));
exports.Set("BUTTON3_DOUBLE_CLICKED", Napi::Number::New(env, BUTTON3_DOUBLE_CLICKED));
exports.Set("BUTTON3_TRIPLE_CLICKED", Napi::Number::New(env, BUTTON3_TRIPLE_CLICKED));

exports.Set("BUTTON4_PRESSED", Napi::Number::New(env, BUTTON4_PRESSED));
exports.Set("BUTTON4_RELEASED", Napi::Number::New(env, BUTTON4_RELEASED));
exports.Set("BUTTON4_CLICKED", Napi::Number::New(env, BUTTON4_CLICKED));
exports.Set("BUTTON4_DOUBLE_CLICKED", Napi::Number::New(env, BUTTON4_DOUBLE_CLICKED));
exports.Set("BUTTON4_TRIPLE_CLICKED", Napi::Number::New(env, BUTTON4_TRIPLE_CLICKED));

#ifdef BUTTON5_PRESSED
exports.Set("BUTTON5_PRESSED", Napi::Number::New(env, BUTTON5_PRESSED));
exports.Set("BUTTON5_RELEASED", Napi::Number::New(env, BUTTON5_RELEASED));
exports.Set("BUTTON5_CLICKED", Napi::Number::New(env, BUTTON5_CLICKED));
exports.Set("BUTTON5_DOUBLE_CLICKED", Napi::Number::New(env, BUTTON5_DOUBLE_CLICKED));
exports.Set("BUTTON5_TRIPLE_CLICKED", Napi::Number::New(env, BUTTON5_TRIPLE_CLICKED));
#endif

// ---------- Mouse modifiers ----------
#ifdef BUTTON_SHIFT
exports.Set("BUTTON_SHIFT", Napi::Number::New(env, BUTTON_SHIFT));
#endif
#ifdef BUTTON_CTRL
exports.Set("BUTTON_CTRL", Napi::Number::New(env, BUTTON_CTRL));
#endif
#ifdef BUTTON_ALT
exports.Set("BUTTON_ALT", Napi::Number::New(env, BUTTON_ALT));
#endif
#ifdef BUTTON_WHEEL_UP
exports.Set("BUTTON_WHEEL_UP", Napi::Number::New(env, BUTTON_WHEEL_UP));
#endif
#ifdef BUTTON_WHEEL_DOWN
exports.Set("BUTTON_WHEEL_DOWN", Napi::Number::New(env, BUTTON_WHEEL_DOWN));
#endif
#ifdef BUTTON_WHEEL_LEFT
exports.Set("BUTTON_WHEEL_LEFT", Napi::Number::New(env, BUTTON_WHEEL_LEFT));
#endif
#ifdef BUTTON_WHEEL_RIGHT
exports.Set("BUTTON_WHEEL_RIGHT", Napi::Number::New(env, BUTTON_WHEEL_RIGHT));
#endif
#ifdef BUTTON_ANY_RELEASED
exports.Set("BUTTON_ANY_RELEASED", Napi::Number::New(env, BUTTON_ANY_RELEASED));
#endif
#ifdef ALL_MOUSE_EVENTS
exports.Set("ALL_MOUSE_EVENTS", Napi::Number::New(env, ALL_MOUSE_EVENTS));
#endif
#ifdef REPORT_MOUSE_POSITION
exports.Set("REPORT_MOUSE_POSITION", Napi::Number::New(env, REPORT_MOUSE_POSITION));
#endif
    return exports;
}

NODE_API_MODULE(ncursesaddon, Init)
