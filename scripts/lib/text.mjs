/** 所有文本类资源共用的格式检查。 */
export function lintTextHygiene(text, report) {
  if (text.includes('\uFFFD')) {
    report('error', 1, '文件不是合法的 UTF-8（包含替换字符）');
  }

  if (text !== '' && !text.endsWith('\n')) {
    report('warn', text.split('\n').length, '文件末尾缺少换行');
  }

  const crIndex = text.indexOf('\r');
  if (crIndex !== -1) {
    report('warn', text.slice(0, crIndex).split('\n').length, '使用 CRLF 换行，建议改为 LF');
  }

  const tabIndex = text.indexOf('\t');
  if (tabIndex !== -1) {
    report('warn', text.slice(0, tabIndex).split('\n').length, '包含制表符（Tab），建议用空格');
  }

  let trailingReported = 0;
  text.split('\n').forEach((line, index) => {
    if (trailingReported >= 5) return;
    if (/[ \t]+$/.test(line)) {
      report('warn', index + 1, '行尾有多余空白字符');
      trailingReported += 1;
    }
  });
}
