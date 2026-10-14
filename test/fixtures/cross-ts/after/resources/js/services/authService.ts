import { http } from './http'
import { formatDate as fmt } from '../utils/format'

export const authService = {
  async logOutOtherSessions () {
    await http.post('me/sessions/logout-others')
    return fmt(new Date())
  },
}
