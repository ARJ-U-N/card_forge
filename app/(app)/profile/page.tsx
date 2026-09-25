import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/page-header'
import { ProfileView } from '@/components/account/profile-view'

export const metadata: Metadata = { title: 'Profile' }

export default function ProfilePage() {
  return (
    <>
      <PageHeader
        title="Profile"
        description="Manage your profile, account, and workspace settings."
      />
      <ProfileView />
    </>
  )
}
