import { redirect } from 'next/navigation';

import { getCurrentCampusSession } from '@/lib/auth/campus-auth';
import { AccountDock } from '@/components/auth/AccountDock';

export default async function AdminPage() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect(session.role === 'teacher' ? '/teacher' : '/student');
  return (
    <>
      <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950">
        <div className="mx-auto max-w-5xl rounded-[28px] border border-slate-200 bg-white p-9 shadow-sm">
          <p className="text-sm font-semibold text-violet-600">教务管理端</p>
          <h1 className="mt-3 text-3xl font-bold">用户、班级与课程关系已接入</h1>
          <p className="mt-4 max-w-2xl leading-7 text-slate-500">
            当前先完成账号、角色、登录会话与课程归属的数据底座。后续教务端可以在这里扩展用户审核、班级管理、课程统计和权限配置。
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {['教师与学生账号', '班级与成员关系', '课程与选课关系'].map((item) => (
              <div key={item} className="rounded-2xl bg-slate-50 p-5 font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>
      </main>
      <AccountDock displayName={session.displayName || session.username} role="教务" />
    </>
  );
}
