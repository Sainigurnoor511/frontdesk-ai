import { redirect } from 'next/navigation'
import { getCurrentOrgAndUser } from '@/lib/data/organization'
import { OrgNameForm } from '@/components/organization/org-name-form'

export default async function OrganizationPage() {
  const context = await getCurrentOrgAndUser()
  if (!context) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization</h1>
        <p className="mt-1 text-sm font-normal text-[#96989d]">Manage your organization details.</p>
      </div>
      <OrgNameForm
        orgId={context.org.id}
        initialName={context.org.name}
        canEdit={context.role === 'owner'}
      />
    </div>
  )
}
