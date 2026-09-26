import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import { campusToolsChat, extractJsonObject } from '@/lib/campus-tools/llm';
import { stripPlainMarkup } from '@/lib/campus-tools/plain-text';
import { apiError, apiSuccess } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHORIZED', 401, '请先登录');

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    topic?: string;
    subject?: string;
    grade?: string;
    duration?: string;
    sourceText?: string;
    difficulty?: string;
    count?: number;
    studentAnswer?: string;
    referenceAnswer?: string;
    rubric?: string;
    noticeKind?: string;
    noticeDraft?: string;
    scene?: string;
    studentLine?: string;
    history?: Array<{ role: string; content: string }>;
  } | null;

  const action = body?.action?.trim();
  if (!action) return apiError('INVALID_REQUEST', 400, '缺少 action');

  try {
    if (action === 'lesson_plan') {
      if (session.role !== 'teacher' && session.role !== 'admin') {
        return apiError('FORBIDDEN', 403, '仅教师可生成教案');
      }
      const topic = body?.topic?.trim() || '';
      if (!topic) return apiError('INVALID_REQUEST', 400, '请填写课题');
      const context = typeof body?.sourceText === 'string' ? body.sourceText.trim() : '';
      const content = await campusToolsChat(
        '你是高校/中小学教案助手。请用纯中文排版输出教案正文，禁止使用 Markdown：不要出现 #、##、*、**、---、```、- 列表符号。用中文序号（一、二、三）和（1）（2）组织结构。必须包含：标题行、学科年级课时、教学目标、教学重难点、教学过程（导入/新授/练习/小结）、板书设计、课后作业。不要输出无关前言或说明。',
        `课题：${topic}\n学科：${body?.subject || '未指定'}\n年级：${body?.grade || '未指定'}\n课时：${body?.duration || '45分钟'}${context ? `\n课堂内容摘要：\n${context.slice(0, 4000)}` : ''}`,
      );
      return apiSuccess({ content: stripPlainMarkup(content) });
    }

    if (action === 'quiz_generate') {
      if (session.role !== 'teacher' && session.role !== 'admin') {
        return apiError('FORBIDDEN', 403, '仅教师可出题');
      }
      const source = body?.sourceText?.trim() || body?.topic?.trim() || '';
      if (!source) return apiError('INVALID_REQUEST', 400, '请提供知识点或教材文本');
      const count = Math.min(Math.max(Number(body?.count) || 5, 1), 15);
      const raw = await campusToolsChat(
        '你是出题助手。只返回 JSON：{"title":"...","questions":[{"qtype":"choice|judge|short|open","prompt":"...","options":[],"answer":"...","explanation":"..."}]}。题型规则：1) choice/judge/short 必须是唯一解客观题，可自动判分；2) choice：options 必须 4 项，answer 为完整选项原文之一；3) judge：options 固定 ["对","错"]，answer 只能是「对」或「错」；4) short：唯一解填空/短答（数字、专有名词、固定术语），options=[]，answer 为唯一标准答案（尽量短）；5) open：仅用于开放性表达（如语文理解、论述），无唯一原文答案，options=[]，answer 写「参考要点/评分模板」（分点），explanation 可补充评分说明；6) 题量以 choice/judge/short 为主，open 至多 1～2 题，材料不适合主观题时不要生成 open。不要输出 Markdown。',
        `难度：${body?.difficulty || 'medium'}\n题量：${count}\n材料：\n${source.slice(0, 8000)}`,
        { json: true },
      );
      const parsed = extractJsonObject(raw) as {
        title?: string;
        questions?: Array<{
          qtype?: string;
          prompt?: string;
          options?: string[];
          answer?: string;
          explanation?: string;
        }>;
      };
      let openCount = 0;
      const questions = (parsed.questions ?? [])
        .filter((q) => q.prompt)
        .map((q) => {
          const rawType = String(q.qtype || 'short').toLowerCase();
          let qtype: 'choice' | 'judge' | 'short' | 'open' = 'short';
          if (rawType.includes('judge') || rawType.includes('判断')) qtype = 'judge';
          else if (rawType.includes('choice') || rawType.includes('选')) qtype = 'choice';
          else if (rawType.includes('open') || rawType.includes('开放') || rawType.includes('论述'))
            qtype = 'open';
          else if (rawType.includes('short') || rawType.includes('填') || rawType.includes('简'))
            qtype = 'short';

          let options = Array.isArray(q.options) ? q.options.map(String) : [];
          let answer = String(q.answer ?? '').trim();

          if (qtype === 'judge') {
            options = ['对', '错'];
            if (/^(对|正确|true|t|yes|√|对的)$/i.test(answer)) answer = '对';
            else if (/^(错|错误|false|f|no|×|错的)$/i.test(answer)) answer = '错';
            else if (answer !== '对' && answer !== '错') answer = '对';
          } else if (qtype === 'open') {
            openCount += 1;
            // Cap open questions
            if (openCount > 2) {
              qtype = 'short';
              options = [];
            } else {
              options = [];
              if (!answer) answer = '参考要点：观点明确；论据充分；表达通顺。';
            }
          } else if (qtype === 'short') {
            options = [];
          } else if (qtype === 'choice' && options.length >= 2) {
            // keep options
          }

          return {
            qtype,
            prompt: String(q.prompt),
            options,
            answer,
            explanation: String(q.explanation ?? ''),
          };
        });
      if (!questions.length) return apiError('INTERNAL_ERROR', 500, '未能生成有效题目');
      return apiSuccess({
        title: parsed.title || `练习：${source.slice(0, 20)}`,
        questions,
      });
    }

    if (action === 'grade_text') {
      if (session.role !== 'teacher' && session.role !== 'admin') {
        return apiError('FORBIDDEN', 403, '仅教师可批改');
      }
      const studentAnswer = body?.studentAnswer?.trim() || '';
      const reference = body?.referenceAnswer?.trim() || '';
      if (!studentAnswer) return apiError('INVALID_REQUEST', 400, '缺少学生作答');
      const raw = await campusToolsChat(
        '你是开放性简答批改助手。只根据「参考要点/评分模板」评估学生作答（非唯一解题目）。返回 JSON：{"score":0-100,"feedback":"评语与改进建议"}。不要要求与参考原文逐字一致。',
        `评分要点模板：${reference || '观点明确、论据充分、表达清晰'}\n补充标准：${body?.rubric || '正确性、完整性、表达清晰'}\n学生作答：${studentAnswer}`,
        { json: true },
      );
      const parsed = extractJsonObject(raw) as { score?: number; feedback?: string };
      return apiSuccess({
        score: Number(parsed.score) || 0,
        feedback: String(parsed.feedback || ''),
      });
    }

    if (action === 'notice_draft') {
      if (session.role !== 'admin' && session.role !== 'teacher') {
        return apiError('FORBIDDEN', 403, '无权限');
      }
      const content = await campusToolsChat(
        body?.noticeKind === 'minutes'
          ? '你是高校会议纪要助手。根据要点写正式中文纪要，含时间、出席、决议、待办。禁止使用 Markdown（不要 #、**、*、`、- 列表符号等），只输出纯文本，可用中文序号「一、二、」分段。'
          : '你是高校教务通知助手。写简洁正式的通知正文，含事由、对象、时间要求、联系方式占位。禁止使用 Markdown（不要 #、**、*、`、- 列表符号等），只输出纯文本，可用中文序号「一、二、」分段。',
        body?.noticeDraft?.trim() || '起草一份例行教研通知',
      );
      return apiSuccess({ content: stripPlainMarkup(content) });
    }

    if (action === 'oral_reply') {
      if (session.role !== 'student' && session.role !== 'admin') {
        return apiError('FORBIDDEN', 403, '仅学生可练口语');
      }
      const scene = body?.scene || 'greeting';
      const history = body?.history ?? [];
      const line = body?.studentLine?.trim() || '';
      if (!line) return apiError('INVALID_REQUEST', 400, '请先输入英文句子');
      const raw = await campusToolsChat(
        `你是英语口语陪练老师 Lily。场景：${scene}。返回 JSON：{"reply":"英文回复","translation":"中文翻译","score":1-5,"feedback":"简短中文点评"}`,
        `历史：${JSON.stringify(history).slice(0, 3000)}\n学生说：${line}`,
        { json: true },
      );
      const parsed = extractJsonObject(raw) as {
        reply?: string;
        translation?: string;
        score?: number;
        feedback?: string;
      };
      return apiSuccess({
        reply: String(parsed.reply || 'Could you say that again?'),
        translation: String(parsed.translation || ''),
        score: Number(parsed.score) || 3,
        feedback: String(parsed.feedback || ''),
      });
    }

    return apiError('INVALID_REQUEST', 400, `未知 action: ${action}`);
  } catch (error) {
    console.error('[CampusTools] generate failed', error);
    const raw = error instanceof Error ? error.message : '生成失败';
    const message = /self[- ]signed certificate|certificate chain|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(
      raw,
    )
      ? '无法连接模型 API：证书校验失败（常见于公司/校园网 HTTPS 代理）。请在 .env.local 设置 LLM_TLS_INSECURE=true 或 NODE_TLS_REJECT_UNAUTHORIZED=0 后重启服务。'
      : raw;
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
