<?php
namespace App\Http\Controllers;

use App\Services\Auth\AuthenticationService;
use App\Services\Auth\TokenManager;

class LogOutOtherSessionsController
{
    public function __construct(private readonly AuthenticationService $auth)
    {
    }

    public function __invoke(Request $request)
    {
        $this->auth->logOutOtherSessions($request->user());
        TokenManager::flushCache();
    }

    public function untyped($thing)
    {
        // no type: must not link, even though TokenManager has this method
        $thing->destroyOtherSessions();
    }
}
