global.CL = undefined;
['lexer','types','parser','parser-stmt','interp','interp-expr','interp-exec','interp-call','lib'].forEach(m=>require('../js/'+m+'.js'));
module.exports = CL;
