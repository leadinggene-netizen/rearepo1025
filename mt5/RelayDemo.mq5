#property strict
#property version "1.000"
#property description "Independent local alert bridge. DEMO accounts only."
#include <Trade/Trade.mqh>

input string BridgeUrl = "http://127.0.0.1:5080";
input string TerminalKey = "PASTE_TERMINAL_KEY";
input long ExpectedLogin = 0;
input ulong MagicNumber = 1025001;
input double MaxLots = 0.10;
input uint DeviationPoints = 20;

CTrade trade;
string journal;
bool busy = false;

bool AccountAllowed()
{
   return AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO &&
          AccountInfoInteger(ACCOUNT_LOGIN) == ExpectedLogin;
}

string EscapeJson(string value)
{
   StringReplace(value, "\\", "\\\\"); StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", " "); StringReplace(value, "\n", " ");
   StringReplace(value, "\t", " ");
   return value;
}

string UrlEncode(string value)
{
   uchar bytes[]; int size = StringToCharArray(value, bytes, 0, WHOLE_ARRAY, CP_UTF8);
   string result = "";
   for(int i = 0; i < size - 1; i++)
   {
      uchar c = bytes[i];
      if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.')
         result += CharToString(c);
      else result += StringFormat("%%%02X", (int)c);
   }
   return result;
}

int Request(string method, string path, string payload, string &response)
{
   char data[], result[]; string headers;
   if(payload != "") { StringToCharArray(payload, data, 0, WHOLE_ARRAY, CP_UTF8); ArrayResize(data, ArraySize(data)-1); }
   ResetLastError();
   int code = WebRequest(method, BridgeUrl + path,
      "Content-Type: application/json\r\nX-Bridge-Key: " + TerminalKey + "\r\n", 1500, data, result, headers);
   response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code == -1) Print("Relay WebRequest failed: ", GetLastError(), ". Check the allowed URL and server.");
   return code;
}

bool SaveResult(string id, string status, string ticket, string detail)
{
   int file = FileOpen(journal, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(file == INVALID_HANDLE) { Print("Cannot write execution journal. Trading stopped."); return false; }
   string payload = "{\"id\":\"" + EscapeJson(id) + "\",\"status\":\"" + status +
      "\",\"ticket\":\"" + EscapeJson(ticket) + "\",\"detail\":\"" + EscapeJson(detail) + "\"}";
   bool written = FileWriteString(file, payload) > 0;
   FileFlush(file); FileClose(file);
   return written;
}

bool ReportPending()
{
   if(!FileIsExist(journal)) return true;
   int file = FileOpen(journal, FILE_READ | FILE_TXT | FILE_ANSI);
   if(file == INVALID_HANDLE) return false;
   string payload = FileReadString(file); FileClose(file);
   string response;
   if(Request("POST", "/api/terminal/result", payload, response) != 200) return false;
   return FileDelete(journal);
}

void Execute(string command)
{
   string parts[];
   if(StringSplit(command, '|', parts) != 7 || parts[0] != "v1") { Print("Invalid bridge protocol"); return; }
   string id = parts[1], action = parts[2], symbol = parts[3];
   double lots = StringToDouble(parts[4]), slPoints = StringToDouble(parts[5]), tpPoints = StringToDouble(parts[6]);
   // Persist an uncertain outcome BEFORE touching the broker. On a crash, only report it.
   if(!SaveResult(id, "unknown", "", "Execution interrupted or not yet confirmed; inspect MT5.")) return;
   string status = "rejected", detail = "Demo account, login or trading permission check failed", ticket = "";
   if(AccountAllowed() && TerminalInfoInteger(TERMINAL_CONNECTED) && TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) &&
      MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_EXPERT))
   {
      if(!SymbolSelect(symbol, true)) detail = "Broker symbol unavailable";
      else if(action == "close" && AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
         detail = "Automatic close requires a hedging account to isolate this EA positions. Close netting positions manually.";
      else if(action == "close")
      {
         int closed = 0, failed = 0;
         for(int i = PositionsTotal() - 1; i >= 0; i--)
         {
            ulong position = PositionGetTicket(i);
            if(position == 0 || PositionGetString(POSITION_SYMBOL) != symbol || (ulong)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
            bool ok = trade.PositionClose(position, DeviationPoints);
            if(ok && trade.ResultRetcode() == TRADE_RETCODE_DONE) closed++; else failed++;
         }
         status = failed > 0 ? "unknown" : "closed";
         detail = StringFormat("Closed %d matching positions; %d unconfirmed. Only this EA magic and symbol were selected.", closed, failed);
      }
      else if(action == "buy" || action == "sell")
      {
         bool existing = false;
         for(int i = 0; i < PositionsTotal(); i++)
            if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_SYMBOL) == symbol) existing = true;
         double minimum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN), maximum = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
         double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
         if(existing) detail = "An existing position on this symbol blocks new entries; no pyramiding or implicit reversal.";
         else if(lots <= 0 || lots > MaxLots || lots > 1 || lots < minimum || lots > maximum || step <= 0 || MathAbs(lots / step - MathRound(lots / step)) > 0.0000001)
            detail = "Lots violate EA limit or broker volume rules";
         else
         {
            MqlTick tick;
            if(!SymbolInfoTick(symbol, tick)) detail = "No broker quote";
            else
            {
               double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
               double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
               int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
               double price = action == "buy" ? tick.ask : tick.bid;
               double direction = action == "buy" ? 1 : -1;
               double sl = slPoints > 0 ? price - direction * slPoints * point : 0;
               double tp = tpPoints > 0 ? price + direction * tpPoints * point : 0;
               if(tickSize > 0) { if(sl > 0) sl = MathRound(sl / tickSize) * tickSize; if(tp > 0) tp = MathRound(tp / tickSize) * tickSize; }
               sl = NormalizeDouble(sl, digits); tp = NormalizeDouble(tp, digits);
               trade.SetTypeFillingBySymbol(symbol);
               bool ok = action == "buy" ? trade.Buy(lots, symbol, 0, sl, tp, "Relay demo") : trade.Sell(lots, symbol, 0, sl, tp, "Relay demo");
               uint code = trade.ResultRetcode();
               status = ok && code == TRADE_RETCODE_DONE ? "filled" :
                  (code == TRADE_RETCODE_DONE_PARTIAL || code == TRADE_RETCODE_TIMEOUT || code == TRADE_RETCODE_CONNECTION || code == TRADE_RETCODE_PLACED ? "unknown" : "rejected");
               ticket = StringFormat("%I64u", trade.ResultDeal());
               detail = StringFormat("retcode=%u; %s; confirmed volume=%.4f", code, trade.ResultRetcodeDescription(), trade.ResultVolume());
            }
         }
      }
      else detail = "Unsupported command";
   }
   SaveResult(id, status, ticket, detail);
   Print("Relay ", id, ": ", status, " / ", detail);
}

int OnInit()
{
   if(ExpectedLogin <= 0 || !AccountAllowed()) { Print("Relay requires the explicitly selected DEMO login."); return INIT_PARAMETERS_INCORRECT; }
   if(TerminalKey == "PASTE_TERMINAL_KEY" || StringLen(TerminalKey) < 20 || MaxLots <= 0 || MaxLots > 1 || MagicNumber == 0) return INIT_PARAMETERS_INCORRECT;
   if(BridgeUrl != "http://127.0.0.1:5080") { Print("This adapter build permits only the local demo server URL."); return INIT_PARAMETERS_INCORRECT; }
   journal = StringFormat("relay-demo-%I64d-%I64u.json", ExpectedLogin, MagicNumber);
   trade.SetExpertMagicNumber(MagicNumber); trade.SetDeviationInPoints(DeviationPoints); trade.SetAsyncMode(false);
   EventSetTimer(1);
   Print("Relay connected locally. No live accounts supported. Keep this EA on only one chart.");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   if(busy || !AccountAllowed()) return;
   busy = true;
   if(ReportPending())
   {
      string response;
      string path = "/api/terminal/poll?mode=demo&account=" + (string)ExpectedLogin + "&broker=" + UrlEncode(AccountInfoString(ACCOUNT_SERVER)) +
         "&balance=" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "&equity=" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2) +
         "&positions=" + (string)PositionsTotal();
      if(Request("GET", path, "", response) == 200) { Execute(response); ReportPending(); }
   }
   busy = false;
}
